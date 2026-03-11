namespace Feudopoly.Server.Lobbies;

public sealed class Lobby
{
    public required Guid LobbyId { get; init; }
    public required Guid SessionId { get; init; }
    public required Guid OwnerUserId { get; set; }
    public required string Name { get; set; }
    public required LobbyAccessType AccessType { get; set; }
    public string? PasswordHash { get; set; }
    public required int MaxPlayers { get; set; }
    public required DateTime CreatedAtUtc { get; init; }
    public required LobbyStatus Status { get; set; }
    public required List<LobbyPlayer> Players { get; init; }
}
