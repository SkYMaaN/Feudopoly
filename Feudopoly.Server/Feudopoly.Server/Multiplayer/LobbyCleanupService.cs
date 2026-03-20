using Feudopoly.Server.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Feudopoly.Server.Multiplayer;

public sealed class LobbyCleanupService(
    SessionStorage sessionStorage,
    IHubContext<LobbyHub> lobbyHub,
    IHubContext<GameHub> gameHub,
    ILogger<LobbyCleanupService> logger) : BackgroundService
{
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(CleanupInterval);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await CleanupExpiredLobbies(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            logger.LogDebug("Lobby cleanup service is stopping.");
        }
    }

    private async Task CleanupExpiredLobbies(CancellationToken cancellationToken)
    {
        var utcNow = DateTime.UtcNow;
        var sessions = sessionStorage.GetSessions();

        foreach (var session in sessions)
        {
            var reason = sessionStorage.GetDeletionReason(session, utcNow);
            if (reason is null)
            {
                continue;
            }

            if (!sessionStorage.DeleteLobby(session))
            {
                continue;
            }

            logger.LogInformation(
                "Lobby {LobbyId} deleted automatically. Reason: {Reason}. Last activity: {LastActivityAtUtc}",
                session.SessionId,
                reason,
                session.LastActivityAtUtc);

            var lobbyGroup = session.SessionId.ToString();
            await gameHub.Clients.Group(lobbyGroup).SendAsync("LobbyDeleted", session.SessionId, cancellationToken);
            await lobbyHub.Clients.Group(lobbyGroup).SendAsync("LobbyDeleted", session.SessionId, cancellationToken);
            await lobbyHub.Clients.Group(LobbyHub.LobbyListGroup).SendAsync("LobbyListDeleted", session.SessionId, cancellationToken);
        }
    }
}
