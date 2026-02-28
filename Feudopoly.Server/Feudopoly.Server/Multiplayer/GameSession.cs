namespace Feudopoly.Server.Multiplayer;

public sealed class GameSession
{
    public required Guid SessionId { get; init; }
    public required List<PlayerState> Players { get; init; }
    public required Guid ActiveTurnPlayerId { get; set; }
    public required int LastRollValue { get; set; }
    public required DateTime CreatedAtUtc { get; init; }
    public required bool IsTurnInProgress { get; set; }
    public GameCellEvent? PendingEvent { get; set; }
    public List<Guid> PendingRollPlayerIds { get; init; } = [];
    public List<ResolvedOutcomeState> PendingResolutionEntries { get; init; } = [];
    public bool PendingRepeatTurn { get; set; }
}

public sealed class ResolvedOutcomeState
{
    public required Guid PlayerId { get; init; }
    public required int Roll { get; init; }
    public required EventOutcome Outcome { get; init; }
}
