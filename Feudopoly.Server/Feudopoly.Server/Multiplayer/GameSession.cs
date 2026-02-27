namespace Feudopoly.Server.Multiplayer;

public sealed class GameSession
{
    public required Guid SessionId { get; init; }
    public required List<PlayerState> Players { get; init; }
    public required Guid ActiveTurnPlayerId { get; set; }
    public required int LastRollValue { get; set; }
    public required DateTime CreatedAtUtc { get; init; }
    public required bool IsTurnInProgress { get; set; }
    public PendingEventRollState? PendingEventRoll { get; set; }
}

public sealed class PendingEventRollState
{
    public required GameCellEvent Event { get; init; }
    public required HashSet<Guid> RequiredPlayerIds { get; init; }
    public required Dictionary<Guid, ResolvedOutcomeEntry> EntriesByPlayerId { get; init; }
    public bool RepeatTurn { get; set; }
}

public sealed class ResolvedOutcomeEntry
{
    public ResolvedOutcomeEntry(Guid playerId, int roll, EventOutcome outcome)
    {
        PlayerId = playerId;
        Roll = roll;
        Outcome = outcome;
    }

    public Guid PlayerId { get; }
    public int Roll { get; }
    public EventOutcome Outcome { get; }
}
