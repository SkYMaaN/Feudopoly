namespace Feudopoly.Server.Multiplayer;

internal static class EventRollFlow
{
    public static bool ShouldStart(GameCellEvent gameEvent, IReadOnlyCollection<PlayerState> participants)
        => gameEvent.ResolutionMode == EventResolutionMode.Roll
           && gameEvent.RollOutcomes.Count > 0
           && participants.Count > 0;

    public static List<PlayerState> ResolveParticipants(
        GameSession session,
        PlayerState currentPlayer,
        GameCellEvent gameEvent,
        Guid? chosenPlayerId,
        Func<GameSession, PlayerState, OutcomeTarget, Guid?, IEnumerable<PlayerState>> resolveTargets)
    {
        if (gameEvent.ResolutionMode != EventResolutionMode.Roll)
        {
            return [];
        }

        return gameEvent.RollOutcomes
            .Select(outcome => outcome.Outcome.Target)
            .Distinct()
            .SelectMany(target => resolveTargets(session, currentPlayer, target, chosenPlayerId))
            .DistinctBy(player => player.PlayerId)
            .ToList();
    }

    public static EventOutcome ResolveOutcome(GameCellEvent gameEvent, int rolled)
        => gameEvent.RollOutcomes.FirstOrDefault(outcome => outcome.Range.InRange(rolled))?.Outcome
           ?? throw new InvalidOperationException("No roll range matched outcome.");
}
