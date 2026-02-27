namespace Feudopoly.Server.Multiplayer;

public sealed class GameStateDto
{
    public required Guid SessionId { get; init; }
    public required IReadOnlyList<PlayerDto> Players { get; init; }
    public required Guid? ActiveTurnPlayerId { get; init; }
    public required int LastRollValue { get; init; }
    public required bool IsTurnInProgress { get; init; }
    public required PendingEventRollDto? PendingEventRoll { get; init; }
}

public sealed class PendingEventRollDto
{
    public required Guid EventId { get; init; }
    public required IReadOnlySet<Guid> RequiredPlayerIds { get; init; }
    public required IReadOnlyCollection<Guid> ResolvedPlayerIds { get; init; }
    public required bool RepeatTurn { get; init; }
}
