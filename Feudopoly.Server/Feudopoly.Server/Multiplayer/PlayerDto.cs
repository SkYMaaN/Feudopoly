namespace Feudopoly.Server.Multiplayer;

public sealed class PlayerDto
{
    public required Guid PlayerId { get; init; }
    public required string DisplayName { get; init; }
    public required bool IsWomen { get; init; }
    public required bool IsMuslim { get; init; }
    public required int Position { get; init; }
    public required int TurnsToSkip { get; init; }
    public required bool IsConnected { get; init; }
    public required bool IsDead { get; init; }
    public required bool IsSpectator { get; init; }
    public required bool IsWinner { get; init; }
}
