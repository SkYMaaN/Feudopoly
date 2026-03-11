using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Hubs;

public sealed class LobbyHub : Hub
{
    public Task SubscribeLobby(Guid lobbyId)
    {
        if (lobbyId == Guid.Empty)
        {
            throw new HubException("Lobby id is required.");
        }

        return Groups.AddToGroupAsync(Context.ConnectionId, lobbyId.ToString());
    }

    public Task UnsubscribeLobby(Guid lobbyId)
    {
        if (lobbyId == Guid.Empty)
        {
            return Task.CompletedTask;
        }

        return Groups.RemoveFromGroupAsync(Context.ConnectionId, lobbyId.ToString());
    }
}
