using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Hubs;

public sealed class GameHub(SessionStorage _sessionStore, EventStorage _eventStorage, ILogger<GameHub> logger) : Hub
{
    private const int BoardCellsCount = 30;

    private const int MaxPlayers = 4;

    private const string SessionIdContextKey = "sessionId";

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (!TryGetSessionId(out var sessionId))
        {
            await base.OnDisconnectedAsync(exception);
            return;
        }

        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            await base.OnDisconnectedAsync(exception);
            return;
        }

        PlayerState? removedPlayer;
        GameStateDto state;

        lock (session)
        {
            removedPlayer = session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId);
            if (removedPlayer is null)
            {
                state = SessionStorage.ToDto(session);
            }
            else
            {
                int removablePlayerIdx = session.Players.FindIndex(p => p.PlayerId == session.ActiveTurnPlayerId);
                int nextTurnPlayerIdx = (removablePlayerIdx + 1) % session.Players.Count;

                session.ActiveTurnPlayerId = session.Players.Count > 0
                    ? session.Players.ElementAt(nextTurnPlayerIdx).PlayerId
                    : Guid.Empty;

                session.Players.Remove(removedPlayer);

                state = SessionStorage.ToDto(session);
            }
        }

        string groupName = sessionId.ToString();

        if (removedPlayer is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
            await Clients.Group(groupName).SendAsync("PlayerLeft", removedPlayer.PlayerId);
            await Clients.Group(groupName).SendAsync("StateUpdated", state);
            _sessionStore.RemoveSessionIfEmpty(sessionId);

            logger.LogInformation("Player {PlayerName}:{PlayerId} disconnected session {SessionId}", removedPlayer.DisplayName, removedPlayer.PlayerId, sessionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinGame(Guid? sessionId, string displayName)
    {
        //sessionId = new Guid("5e1dd9b1-79ba-4e13-962c-463e59860994");

        if (sessionId is null || sessionId == Guid.Empty)
        {
            throw new HubException("Session id is required.");
        }

        if (String.IsNullOrWhiteSpace(displayName))
        {
            throw new InvalidDataException("Display name is required.");
        }

        displayName = displayName.Trim();

        var session = _sessionStore.GetOrCreateSession(sessionId.Value);

        PlayerState? joinedPlayer;
        GameStateDto state;

        lock (session)
        {
            if (session.Players.Count >= MaxPlayers)
            {
                throw new HubException("Game session is full.");
            }

            joinedPlayer = new PlayerState
            {
                ConnectionId = Context.ConnectionId,
                PlayerId = Guid.NewGuid(),
                DisplayName = displayName,
                Position = 0,
                IsConnected = true
            };

            session.Players.Add(joinedPlayer);
            state = SessionStorage.ToDto(session);
        }

        Context.Items[SessionIdContextKey] = sessionId;

        string groupName = sessionId.Value.ToString();

        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        await Clients.Caller.SendAsync("Joined", joinedPlayer.PlayerId, state);
        await Clients.OthersInGroup(groupName).SendAsync("PlayerJoined", SessionStorage.ToDto(session));
        await Clients.Group(groupName).SendAsync("StateUpdated", state);

        logger.LogInformation("Player {PlayerName}:{PlayerId} joined session {SessionId}", joinedPlayer.DisplayName, joinedPlayer.PlayerId, sessionId);
        logger.LogInformation("Players count: {playersCount}", session.Players.Count);
    }

    public async Task RollDice(Guid sessionId)
    {
        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        PlayerState currentPlayer;
        int rolled;
        GameStateDto state;

        lock (session)
        {
            if (session.Players.Count == 0)
            {
                throw new HubException("No players in session.");
            }

            if (session.Players.Count == 1)
            {
                //throw new HubException("You can't play with yourself. You need more players!");
            }

            var caller = session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId);
            if (caller is null)
            {
                throw new HubException("Player is not part of this session.");
            }

            if (session.ActiveTurnPlayerId == Guid.Empty)
            {
                session.ActiveTurnPlayerId = session.Players.First().PlayerId;
            }

            if (caller.PlayerId != session.ActiveTurnPlayerId)
            {
                throw new HubException("Not your turn.");
            }

            if (session.IsTurnInProgress)
            {
                throw new HubException("Turn is not finished yet.");
            }

            currentPlayer = session.Players.First(p => p.PlayerId == session.ActiveTurnPlayerId);
            rolled = Random.Shared.Next(1, 7);
            session.LastRollValue = rolled;
            currentPlayer.Position = (currentPlayer.Position + rolled) % BoardCellsCount;

            session.IsTurnInProgress = true;
            state = SessionStorage.ToDto(session);
        }

        string groupName = sessionId.ToString();

        await Clients.Caller.SendAsync("DiceRolled", new
        {
            playerId = currentPlayer.PlayerId,
            rollValue = rolled,
            newPosition = currentPlayer.Position
        });
        await Clients.Group(groupName).SendAsync("StateUpdated", state);

        logger.LogInformation("Player {PlayerName}:{PlayerId} rolled {rollValue}", currentPlayer.DisplayName, currentPlayer.PlayerId, rolled);
    }


    public async Task BeginTurn(Guid sessionId)
    {
        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        GameStateDto state;
        GameCellEvent cellEvent;
        PlayerState currentPlayer;

        lock (session)
        {
            if (session.Players.Count == 0)
            {
                throw new HubException("No players in session.");
            }

            var caller = session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId);
            if (caller is null)
            {
                throw new HubException("Player is not part of this session.");
            }

            if (caller.PlayerId != session.ActiveTurnPlayerId)
            {
                throw new HubException("Not your turn.");
            }

            if (!session.IsTurnInProgress)
            {
                throw new HubException("Turn is already completed.");
            }

            if (!_eventStorage.Events.TryGetValue(caller.Position, out cellEvent))
            {
                logger.LogError("Event for {position} position does not exist!", caller.Position);
                throw new HubException($"Event for {caller.Position} position does not exist!");
            }

            currentPlayer = session.Players.First(p => p.PlayerId == session.ActiveTurnPlayerId);

            //int currentTurnPlayerIdx = session.Players.FindIndex(p => p.PlayerId == currentPlayer.PlayerId);
            //int nextTurnPlayerIdx = (currentTurnPlayerIdx + 1) % session.Players.Count;

            //session.ActiveTurnPlayerId = session.Players[nextTurnPlayerIdx].PlayerId;
            //session.IsTurnInProgress = false;

            state = SessionStorage.ToDto(session);
        }

        string groupName = sessionId.ToString();
        await Clients.Group(groupName).SendAsync("StateUpdated", state);
        await Clients.Caller.SendAsync("TurnBegan", cellEvent);

        logger.LogInformation("Player {PlayerName}:{PlayerId} started {cellEvent}", currentPlayer.DisplayName, currentPlayer.PlayerId, cellEvent);
    }

    public async Task FinishTurn(Guid sessionId)
    {
        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        GameStateDto state;
        GameCellEvent cellEvent;
        PlayerState currentPlayer;

        lock (session)
        {
            if (session.Players.Count == 0)
            {
                throw new HubException("No players in session.");
            }

            var caller = session.Players.FirstOrDefault(player => player.ConnectionId == Context.ConnectionId);
            if (caller is null)
            {
                throw new HubException("Player is not part of this session.");
            }

            if (caller.PlayerId != session.ActiveTurnPlayerId)
            {
                throw new HubException("Not your turn.");
            }

            if (!session.IsTurnInProgress)
            {
                throw new HubException("Turn isn't stated.");
            }

            if (!_eventStorage.Events.TryGetValue(caller.Position, out cellEvent))
            {
                logger.LogError("Event for {position} position does not exist!", caller.Position);
                throw new HubException($"Event for {caller.Position} position does not exist!");
            }

            currentPlayer = session.Players.First(p => p.PlayerId == session.ActiveTurnPlayerId);

            int currentTurnPlayerIdx = session.Players.FindIndex(p => p.PlayerId == currentPlayer.PlayerId);
            int nextTurnPlayerIdx = (currentTurnPlayerIdx + 1) % session.Players.Count;

            session.ActiveTurnPlayerId = session.Players[nextTurnPlayerIdx].PlayerId;
            session.IsTurnInProgress = false;

            state = SessionStorage.ToDto(session);
        }

        string groupName = sessionId.ToString();
        await Clients.Group(groupName).SendAsync("StateUpdated", state);
        await Clients.Caller.SendAsync("TurnEnded", cellEvent);

        logger.LogInformation("Player {PlayerName}:{PlayerId} finished {cellEvent}", currentPlayer.DisplayName, currentPlayer.PlayerId, cellEvent);
    }

    public async Task SyncState(Guid sessionId)
    {
        if (!_sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        GameStateDto state;

        lock (session)
        {
            state = SessionStorage.ToDto(session);
        }

        await Clients.Caller.SendAsync("StateUpdated", state);
    }

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
