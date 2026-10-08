using Feudopoly.Server.Controllers;
using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Hubs;

public sealed class LobbyHub(
    SessionStorage sessionStorage,
    GameNotifier gameNotifier,
    IHubContext<LobbyHub> lobbyHubContext,
    ILogger<LobbyHub> logger) : Hub
{
    public const string LobbyListGroup = "lobby-list";
    private const string MembershipContextKey = "lobbyMembership";

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // A member who closes the lobby room before the game starts would otherwise stay in the lobby forever
        // and block joining any other lobby.
        if (Context.Items.TryGetValue(MembershipContextKey, out var value) && value is LobbyMembership membership)
        {
            await RemoveWaitingMember(membership);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public Task SubscribeLobbyList()
    {
        return Groups.AddToGroupAsync(Context.ConnectionId, LobbyListGroup);
    }

    public Task UnsubscribeLobbyList()
    {
        return Groups.RemoveFromGroupAsync(Context.ConnectionId, LobbyListGroup);
    }

    /// <param name="playerId">Set when the subscriber is a lobby member; the membership ends when this connection drops.</param>
    public Task SubscribeLobby(Guid lobbyId, Guid? playerId = null, string? playerKey = null)
    {
        if (lobbyId == Guid.Empty)
        {
            throw new HubException("Lobby id is required.");
        }

        if (playerId is Guid memberId && IsMember(lobbyId, memberId, playerKey))
        {
            Context.Items[MembershipContextKey] = new LobbyMembership(lobbyId, memberId, playerKey!);
        }

        return Groups.AddToGroupAsync(Context.ConnectionId, lobbyId.ToString());
    }

    public Task UnsubscribeLobby(Guid lobbyId)
    {
        if (lobbyId == Guid.Empty)
        {
            return Task.CompletedTask;
        }

        if (Context.Items.TryGetValue(MembershipContextKey, out var value) && value is LobbyMembership membership && membership.LobbyId == lobbyId)
        {
            Context.Items.Remove(MembershipContextKey);
        }

        return Groups.RemoveFromGroupAsync(Context.ConnectionId, lobbyId.ToString());
    }

    private bool IsMember(Guid lobbyId, Guid playerId, string? playerKey)
    {
        if (!sessionStorage.TryGetSession(lobbyId, out var session) || session is null)
        {
            return false;
        }

        lock (session)
        {
            var player = session.Players.FirstOrDefault(p => p.PlayerId == playerId);
            return player is not null && SessionStorage.IsPlayerKeyValid(player, playerKey);
        }
    }

    private async Task RemoveWaitingMember(LobbyMembership membership)
    {
        if (!sessionStorage.TryGetSession(membership.LobbyId, out var session) || session is null)
        {
            return;
        }

        lock (session)
        {
            if (session.Status is not (LobbyStatus.WaitingForPlayers or LobbyStatus.Ready)
                || session.Players.All(p => p.PlayerId != membership.PlayerId))
            {
                return;
            }
        }

        bool removedLobby;
        try
        {
            removedLobby = sessionStorage.LeaveLobby(session, membership.PlayerId, membership.PlayerKey);
        }
        catch (Exception ex) when (ex is InvalidDataException or UnauthorizedAccessException)
        {
            // The lobby changed (started or player left) between the check and the removal.
            return;
        }

        logger.LogInformation("Player {PlayerId} disconnected from waiting lobby {LobbyId} and was removed", membership.PlayerId, membership.LobbyId);

        if (removedLobby)
        {
            await gameNotifier.LobbyDeletedAsync(membership.LobbyId);
            return;
        }

        await LobbiesController.NotifyLobbyUpdated(lobbyHubContext, session);
        await LobbiesController.NotifyLobbyListChanged(lobbyHubContext, session);
    }

    private sealed record LobbyMembership(Guid LobbyId, Guid PlayerId, string PlayerKey);
}
