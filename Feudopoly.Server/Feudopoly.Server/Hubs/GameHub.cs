using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Hubs;

public sealed class GameHub(SessionStorage _sessionStore, GameEngine _engine, GameNotifier _notifier, ILogger<GameHub> logger) : Hub
{
    private const string SessionIdContextKey = "sessionId";

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (!TryGetSessionId(out var sessionId))
        {
            logger.LogDebug("Connection {ConnectionId} disconnected without a tracked session", Context.ConnectionId);
            await base.OnDisconnectedAsync(exception);
            return;
        }

        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            logger.LogDebug("Connection {ConnectionId} disconnected from missing session {SessionId}", Context.ConnectionId, sessionId);
            await base.OnDisconnectedAsync(exception);
            return;
        }

        // A disconnect is final by design: the player leaves the match and there is no reconnect.
        PlayerState? removedPlayer;
        RemovePlayerResult? result = null;
        GameStateDto? state = null;

        lock (session)
        {
            removedPlayer = session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId);
            if (removedPlayer is not null)
            {
                result = _engine.RemovePlayer(session, removedPlayer);
                if (!result.SessionRemoved)
                {
                    SessionStorage.TouchSession(session);
                    state = SessionStorage.ToDto(session);
                }
            }
        }

        if (removedPlayer is not null && result is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, sessionId.ToString());
            await _notifier.PlayerRemovedAsync(sessionId, removedPlayer.PlayerId, result, state);

            logger.LogInformation("Player {PlayerName}:{PlayerId} disconnected session {SessionId}. SessionRemoved: {SessionRemoved}", removedPlayer.DisplayName, removedPlayer.PlayerId, sessionId, result.SessionRemoved);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinGame(Guid? sessionId, Guid playerId, string? playerKey)
    {
        logger.LogInformation(
            "JoinGame requested by connection {ConnectionId} for session {SessionId} and player {PlayerId}",
            Context.ConnectionId,
            sessionId,
            playerId);

        if (sessionId is null || sessionId == Guid.Empty)
        {
            throw new HubException("Session id is required.");
        }

        if (!_sessionStore.TryGetSession(sessionId.Value, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        PlayerState joinedPlayer;
        GameStateDto state;

        lock (session)
        {
            joinedPlayer = session.Players.FirstOrDefault(p => p.PlayerId == playerId)
                ?? throw new HubException("Player is not part of lobby.");

            if (!SessionStorage.IsPlayerKeyValid(joinedPlayer, playerKey))
            {
                throw new HubException("Invalid player credentials.");
            }

            _engine.JoinPlayer(session, joinedPlayer, Context.ConnectionId);
            SessionStorage.TouchSession(session);
            state = SessionStorage.ToDto(session);
        }

        Context.Items[SessionIdContextKey] = sessionId;

        string groupName = sessionId.Value.ToString();
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        await Clients.Caller.SendAsync("Joined", joinedPlayer.PlayerId, state);
        await Clients.OthersInGroup(groupName).SendAsync("PlayerJoined", state);
        await Clients.Group(groupName).SendAsync("StateUpdated", state);

        logger.LogInformation(
            "Player {PlayerName}:{PlayerId} joined session {SessionId}. Players in session: {PlayerCount}",
            joinedPlayer.DisplayName,
            joinedPlayer.PlayerId,
            sessionId,
            state.Players.Count);
    }

    public async Task RollDice(Guid sessionId)
    {
        logger.LogDebug("RollDice requested by connection {ConnectionId} for session {SessionId}", Context.ConnectionId, sessionId);

        var session = GetSession(sessionId);
        RollResult result;
        GameStateDto state;

        lock (session)
        {
            var caller = GetCaller(session);
            result = _engine.Roll(session, caller);
            SessionStorage.TouchSession(session);
            state = SessionStorage.ToDto(session);
        }

        await _notifier.RolledAsync(sessionId, Context.ConnectionId, result, state);

        logger.LogInformation(
            "Player {PlayerId} rolled {RollValue} in session {SessionId}. EventPhase: {IsEventPhase}. NewPosition: {NewPosition}",
            result.PlayerId,
            result.Rolled,
            sessionId,
            result.IsEventPhaseRoll,
            result.NewPosition);
    }

    public async Task BeginTurn(Guid sessionId)
    {
        logger.LogDebug("BeginTurn requested by connection {ConnectionId} for session {SessionId}", Context.ConnectionId, sessionId);

        var session = GetSession(sessionId);
        GameStateDto state;
        GameCellEvent cellEvent;

        lock (session)
        {
            cellEvent = _engine.BeginTurn(session, GetCaller(session));
            SessionStorage.TouchSession(session);
            state = SessionStorage.ToDto(session);
        }

        string groupName = sessionId.ToString();
        await Clients.Group(groupName).SendAsync("StateUpdated", state);
        await Clients.Caller.SendAsync("TurnBegan", cellEvent);

        logger.LogInformation(
            "Turn began in session {SessionId} for connection {ConnectionId} on event '{EventTitle}'",
            sessionId,
            Context.ConnectionId,
            cellEvent.Title);
    }

    public async Task FinishTurn(Guid sessionId, Guid? chosenPlayerId = null)
    {
        logger.LogDebug("FinishTurn requested by connection {ConnectionId} for session {SessionId}", Context.ConnectionId, sessionId);

        var session = GetSession(sessionId);
        GameStateDto state;
        FinishTurnResult result;

        lock (session)
        {
            result = _engine.FinishTurn(session, GetCaller(session), chosenPlayerId);
            SessionStorage.TouchSession(session);
            state = SessionStorage.ToDto(session);
        }

        await _notifier.TurnFinishedAsync(sessionId, Context.ConnectionId, result, state);

        logger.LogInformation(
            "Turn finished in session {SessionId}. Event '{EventTitle}', entries: {EntriesCount}, repeat turn: {RepeatTurn}, event roll phase: {IsEventRollPhase}",
            sessionId,
            result.Resolution.Event.Title,
            result.Resolution.Entries.Count,
            result.Resolution.RepeatTurn,
            result.Resolution.IsEventRollPhase);
    }

    public async Task BecomeSpectator(Guid sessionId)
    {
        var session = GetSession(sessionId);
        GameStateDto state;
        lock (session)
        {
            var caller = GetCaller(session);
            if (!caller.IsDead && !caller.IsWinner)
            {
                throw new HubException("Only dead or victorious players can become spectators.");
            }

            caller.IsSpectator = true;
            SessionStorage.TouchSession(session);
            state = SessionStorage.ToDto(session);
        }

        await Clients.Group(sessionId.ToString()).SendAsync("StateUpdated", state);
    }

    public async Task LeaveGame(Guid sessionId)
    {
        var session = GetSession(sessionId);
        Guid removedPlayerId;
        RemovePlayerResult result;
        GameStateDto? state = null;

        lock (session)
        {
            var caller = GetCaller(session);
            removedPlayerId = caller.PlayerId;
            result = _engine.RemovePlayer(session, caller);

            if (!result.SessionRemoved)
            {
                SessionStorage.TouchSession(session);
                state = SessionStorage.ToDto(session);
            }
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, sessionId.ToString());
        await _notifier.PlayerRemovedAsync(sessionId, removedPlayerId, result, state);
    }

    public async Task SyncState(Guid sessionId)
    {
        logger.LogDebug("SyncState requested by connection {ConnectionId} for session {SessionId}", Context.ConnectionId, sessionId);

        var session = GetSession(sessionId);
        GameStateDto state;
        lock (session)
        {
            state = SessionStorage.ToDto(session);
        }

        await Clients.Caller.SendAsync("StateUpdated", state);
    }

    private GameSession GetSession(Guid sessionId)
    {
        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        return session;
    }

    private PlayerState GetCaller(GameSession session) =>
        session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId)
        ?? throw new HubException("Player is not part of this session.");

    private bool TryGetSessionId(out Guid sessionId)
    {
        if (Context.Items.TryGetValue(SessionIdContextKey, out var value) && value is Guid sid)
        {
            sessionId = sid;
            return true;
        }

        sessionId = Guid.Empty;
        return false;
    }
}
