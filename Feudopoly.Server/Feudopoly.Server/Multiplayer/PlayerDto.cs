namespace Feudopoly.Server.Multiplayer;

public sealed class PlayerDto
{
    public required Guid PlayerId { get; init; }
    public required string DisplayName { get; init; }
    public required bool IsMan { get; init; }
    public required bool IsMuslim { get; init; }
    public required int Position { get; init; }
    public required bool IsConnected { get; init; }
}
