namespace Feudopoly.Server.Multiplayer;

public sealed class GameStateDto
{
    public required Guid SessionId { get; init; }
    public required IReadOnlyList<PlayerDto> Players { get; init; }
    public required Guid? ActiveTurnPlayerId { get; init; }
    public required int LastRollValue { get; init; }
    public required bool IsTurnInProgress { get; init; }
}
