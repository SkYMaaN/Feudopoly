namespace Feudopoly.Server.Multiplayer;

public sealed class PlayerState
{
    public required string ConnectionId { get; init; }
    public required Guid PlayerId { get; init; }
    public required string DisplayName { get; set; }
    public required int Position { get; set; }
    public required bool IsConnected { get; set; }
}
