using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Hubs;

public sealed class GameHub(SessionStore sessionStore, ILogger<GameHub> logger) : Hub
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

        if (!sessionStore.TryGetSession(sessionId, out var session) || session is null)
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
                state = SessionStore.ToDto(session);
            }
            else
            {
                int removablePlayerIdx = session.Players.FindIndex(p => p.PlayerId == session.ActiveTurnPlayerId);
                int nextTurnPlayerIdx = (removablePlayerIdx + 1) % session.Players.Count;

                session.ActiveTurnPlayerId = session.Players.Count > 0
                    ? session.Players.ElementAt(nextTurnPlayerIdx).PlayerId
                    : Guid.Empty;

                session.Players.Remove(removedPlayer);

                state = SessionStore.ToDto(session);
            }
        }

        string groupName = sessionId.ToString();

        if (removedPlayer is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
            await Clients.Group(groupName).SendAsync("PlayerLeft", removedPlayer.PlayerId);
            await Clients.Group(groupName).SendAsync("StateUpdated", state);
            sessionStore.RemoveSessionIfEmpty(sessionId);

            logger.LogInformation("Player {PlayerName}:{PlayerId} disconnected session {SessionId}", removedPlayer.DisplayName, removedPlayer.PlayerId, sessionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinGame(Guid? sessionId, string displayName)
    {
        //sessionId = new Guid("959ebe53-a257-41a2-b1b1-367d97cb4079");

        if (sessionId is null || sessionId == Guid.Empty)
        {
            throw new HubException("Session id is required.");
        }

        if (String.IsNullOrWhiteSpace(displayName))
        {
            throw new InvalidDataException("Display name is required.");
        }

        displayName = displayName.Trim();

        var session = sessionStore.GetOrCreateSession(sessionId.Value);

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
            state = SessionStore.ToDto(session);
        }

        Context.Items[SessionIdContextKey] = sessionId;

        string groupName = sessionId.Value.ToString();

        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        await Clients.Caller.SendAsync("Joined", joinedPlayer.PlayerId, state);
        await Clients.OthersInGroup(groupName).SendAsync("PlayerJoined", SessionStore.ToDto(session));
        await Clients.Group(groupName).SendAsync("StateUpdated", state);

        logger.LogInformation("Player {PlayerName}:{PlayerId} joined session {SessionId}", joinedPlayer.DisplayName, joinedPlayer.PlayerId, sessionId);
        logger.LogInformation("Players count: {playersCount}", session.Players.Count);
    }

    public async Task RollDice(Guid sessionId)
    {
        if (!sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        PlayerState currentPlayer;
        int rolled;
        Guid nextTurnPlayerId;
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

            currentPlayer = session.Players.First(p => p.PlayerId == session.ActiveTurnPlayerId);
            rolled = Random.Shared.Next(1, 7);
            session.LastRollValue = rolled;
            currentPlayer.Position = (currentPlayer.Position + rolled) % BoardCellsCount;

            int currentTurnPlayerIdx = session.Players.FindIndex(p => p.PlayerId == session.ActiveTurnPlayerId);
            int nextTurnPlayerIdx = (currentTurnPlayerIdx + 1) % session.Players.Count;

            nextTurnPlayerId = session.Players.ElementAt(nextTurnPlayerIdx).PlayerId;
            session.ActiveTurnPlayerId = nextTurnPlayerId;

            state = SessionStore.ToDto(session);
        }

        string groupName = sessionId.ToString();

        await Clients.Group(groupName).SendAsync("DiceRolled", new
        {
            playerId = currentPlayer.PlayerId,
            rollValue = rolled,
            newPosition = currentPlayer.Position,
            nextTurnPlayerId
        });

        await Clients.Group(groupName).SendAsync("StateUpdated", state);

        logger.LogInformation("Player {PlayerName}:{PlayerId} rolled {rollValue}", currentPlayer.DisplayName, currentPlayer.PlayerId, rolled);
    }

    public async Task SyncState(Guid sessionId)
    {
        if (!sessionStore.TryGetSession(sessionId, out var session) || session is null)
        {
            throw new HubException("Session not found.");
        }

        GameStateDto state;

        lock (session)
        {
            state = SessionStore.ToDto(session);
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
