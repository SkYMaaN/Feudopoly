namespace Feudopoly.Server.Lobbies;

public sealed class LobbyPlayer
{
    public required Guid UserId { get; init; }
    public required string DisplayName { get; set; }
    public required DateTime JoinedAtUtc { get; init; }
    public required bool IsOwner { get; set; }
}
