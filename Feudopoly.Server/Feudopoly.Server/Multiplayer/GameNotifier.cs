using Feudopoly.Server.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Multiplayer;

/// <summary>
/// Sends game hub messages. Shared by <see cref="GameHub"/> (player actions) and <see cref="TurnTimeoutService"/> (server actions).
/// </summary>
public sealed class GameNotifier(IHubContext<GameHub> gameHub, IHubContext<LobbyHub> lobbyHub)
{
    public async Task RolledAsync(Guid sessionId, string connectionId, RollResult result, GameStateDto state)
    {
        var groupName = sessionId.ToString();
        var rollPayload = new
        {
            playerId = result.PlayerId,
            rollValue = result.Rolled,
            newPosition = result.NewPosition,
            completedWinningLap = result.CompletedWinningLap
        };

        if (!string.IsNullOrEmpty(connectionId))
        {
            var caller = gameHub.Clients.Client(connectionId);
            await caller.SendAsync(result.IsEventPhaseRoll ? "EventDiceRolled" : "DiceRolled", rollPayload);
        }

        if (result.PhaseResolution is not null)
        {
            await TurnEndedAsync(groupName, connectionId, result.PhaseResolution);
        }

        await gameHub.Clients.Group(groupName).SendAsync("StateUpdated", state);
        if (result.GameCompleted)
        {
            await gameHub.Clients.Group(groupName).SendAsync("GameCompleted", GameEngine.CreateGameCompletionPayload(state));
        }
    }

    public async Task TurnFinishedAsync(Guid sessionId, string connectionId, FinishTurnResult result, GameStateDto state)
    {
        var groupName = sessionId.ToString();
        await gameHub.Clients.Group(groupName).SendAsync("StateUpdated", state);
        await TurnEndedAsync(groupName, connectionId, result.Resolution);
        if (result.GameCompleted)
        {
            await gameHub.Clients.Group(groupName).SendAsync("GameCompleted", GameEngine.CreateGameCompletionPayload(state));
        }
    }

    public async Task PlayerRemovedAsync(Guid sessionId, Guid removedPlayerId, RemovePlayerResult result, GameStateDto? state)
    {
        var groupName = sessionId.ToString();
        if (result.SessionRemoved)
        {
            await LobbyDeletedAsync(sessionId);
            return;
        }

        await gameHub.Clients.Group(groupName).SendAsync("PlayerLeft", removedPlayerId);
        await gameHub.Clients.Group(groupName).SendAsync("StateUpdated", state);
        if (result.GameCompleted && state is not null)
        {
            await gameHub.Clients.Group(groupName).SendAsync("GameCompleted", GameEngine.CreateGameCompletionPayload(state));
        }
    }

    public async Task LobbyDeletedAsync(Guid sessionId)
    {
        var groupName = sessionId.ToString();
        await gameHub.Clients.Group(groupName).SendAsync("LobbyDeleted", sessionId);
        await lobbyHub.Clients.Group(groupName).SendAsync("LobbyDeleted", sessionId);
        await lobbyHub.Clients.Group(LobbyHub.LobbyListGroup).SendAsync("LobbyListDeleted", sessionId);
    }

    private async Task TurnEndedAsync(string groupName, string connectionId, TurnResolutionPayload resolution)
    {
        // The acting player gets the full result screen; everyone else gets a summary so players hit by
        // someone else's event (chosen target, group effects) see why their token moved.
        if (string.IsNullOrEmpty(connectionId))
        {
            await gameHub.Clients.Group(groupName).SendAsync("EventResolved", resolution);
            return;
        }

        await gameHub.Clients.Client(connectionId).SendAsync("TurnEnded", resolution);
        await gameHub.Clients.GroupExcept(groupName, connectionId).SendAsync("EventResolved", resolution);
    }
}
