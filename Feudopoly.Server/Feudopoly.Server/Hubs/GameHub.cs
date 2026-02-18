using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Hubs;

public sealed class GameHub(SessionStore sessionStore, ILogger<GameHub> logger) : Hub
{
    private const int BoardCellsCount = 28;
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
                session.Players.Remove(removedPlayer);

                if (session.Players.Count > 0)
                {
                    session.ActiveTurnIndex %= session.Players.Count;
                }
                else
                {
                    session.ActiveTurnIndex = 0;
                }

                state = SessionStore.ToDto(session);
            }
        }

        if (removedPlayer is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, sessionId);
            await Clients.Group(sessionId).SendAsync("PlayerLeft", removedPlayer.PlayerId);
            await Clients.Group(sessionId).SendAsync("StateUpdated", state);
            sessionStore.RemoveSessionIfEmpty(sessionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task JoinGame(string sessionId, string displayName)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new HubException("Session id is required.");
        }

        displayName = string.IsNullOrWhiteSpace(displayName)
            ? $"Player-{Context.ConnectionId[..6]}"
            : displayName.Trim();

        sessionId = sessionId.Trim();
        var session = sessionStore.GetOrCreateSession(sessionId);

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

        await Groups.AddToGroupAsync(Context.ConnectionId, sessionId);
        await Clients.Caller.SendAsync("Joined", joinedPlayer.PlayerId, state);
        await Clients.OthersInGroup(sessionId).SendAsync("PlayerJoined", SessionStore.ToDto(session));
        await Clients.Group(sessionId).SendAsync("StateUpdated", state);

        logger.LogInformation("Player {PlayerId} joined session {SessionId}", joinedPlayer.PlayerId, sessionId);
    }

    public async Task RollDice(string sessionId)
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

            var callerIndex = session.Players.FindIndex(player => player.ConnectionId == Context.ConnectionId);
            if (callerIndex < 0)
            {
                throw new HubException("Player is not part of this session.");
            }

            if (callerIndex != session.ActiveTurnIndex)
            {
                throw new HubException("Not your turn.");
            }

            currentPlayer = session.Players[session.ActiveTurnIndex];
            rolled = Random.Shared.Next(1, 7);
            session.LastRollValue = rolled;
            currentPlayer.Position = (currentPlayer.Position + rolled) % BoardCellsCount;
            session.ActiveTurnIndex = (session.ActiveTurnIndex + 1) % session.Players.Count;
            nextTurnPlayerId = session.Players[session.ActiveTurnIndex].PlayerId;
            state = SessionStore.ToDto(session);
        }

        await Clients.Group(sessionId).SendAsync("DiceRolled", new
        {
            playerId = currentPlayer.PlayerId,
            rollValue = rolled,
            newPosition = currentPlayer.Position,
            nextTurnPlayerId
        });

        await Clients.Group(sessionId).SendAsync("StateUpdated", state);
    }

    public async Task SyncState(string sessionId)
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

    private bool TryGetSessionId(out string sessionId)
    {
        if (Context.Items.TryGetValue(SessionIdContextKey, out var value) && value is string sid)
        {
            sessionId = sid;
            return true;
        }

        sessionId = string.Empty;
        return false;
    }
}
