using Feudopoly.Server.Multiplayer;

namespace Feudopoly.Server.Tests;

/// <summary>
/// Pins event number -> rule and dice range -> outcome for every board event.
/// Ranges are checked roll by roll so an outcome attached to the wrong range or the wrong event fails loudly.
/// </summary>
public sealed class EventStorageTests
{
    private static readonly EventStorage Storage = new();

    [Fact]
    public void Board_has_events_on_cells_1_to_29_only()
    {
        Assert.Equal(Enumerable.Range(1, 29), Storage.Events.Keys.Order());
        Assert.False(Storage.Events.ContainsKey(0));
    }

    [Fact]
    public void Every_roll_event_maps_each_die_face_to_exactly_one_outcome()
    {
        foreach (var (number, gameEvent) in Storage.Events.Where(e => e.Value.ResolutionMode == EventResolutionMode.Roll))
        {
            for (var face = 1; face <= 6; face++)
            {
                Assert.True(
                    gameEvent.RollOutcomes.Count(o => o.Range.InRange(face)) == 1,
                    $"Event {number}: die face {face} must match exactly one outcome.");
            }
        }
    }

    [Theory]
    [InlineData(2, OutcomeKind.SkipTurns, 2)]
    [InlineData(3, OutcomeKind.RepeatRoll, 0)]
    [InlineData(5, OutcomeKind.SkipTurns, 1)]
    [InlineData(6, OutcomeKind.MoveByOffset, -2)]
    [InlineData(7, OutcomeKind.MoveByOffset, 2)]
    [InlineData(11, OutcomeKind.MoveByOffset, 1)]
    [InlineData(13, OutcomeKind.MoveByOffset, 1)]
    [InlineData(15, OutcomeKind.MoveToCell, 8)]
    [InlineData(17, OutcomeKind.None, 0)]
    [InlineData(19, OutcomeKind.MoveToCell, 17)]
    [InlineData(25, OutcomeKind.None, 0)]
    [InlineData(26, OutcomeKind.MoveByOffset, 2)]
    [InlineData(28, OutcomeKind.MoveToCell, 24)]
    public void Fixed_event_applies_its_effect_to_the_current_player(int eventNumber, OutcomeKind kind, int value)
    {
        var gameEvent = Storage.Events[eventNumber];

        Assert.Equal(EventResolutionMode.Fixed, gameEvent.ResolutionMode);
        var outcome = Assert.Single(gameEvent.FixedOutcomes);
        Assert.Equal(OutcomeTarget.CurrentPlayer, outcome.Target);
        AssertOutcome(outcome, kind, value);
    }

    [Fact]
    public void Event_12_moves_a_chosen_player_back_5()
    {
        var outcome = Assert.Single(Storage.Events[12].FixedOutcomes);
        Assert.Equal(OutcomeTarget.ChosenPlayer, outcome.Target);
        AssertOutcome(outcome, OutcomeKind.MoveByOffset, -5);
    }

    [Fact]
    public void Event_23_moves_muslims_forward_and_everyone_else_back()
    {
        var outcomes = Storage.Events[23].FixedOutcomes;

        Assert.Equal(2, outcomes.Count);
        Assert.Contains(outcomes, o => o.Target == OutcomeTarget.Muslims && o.Kind == OutcomeKind.MoveByOffset && o.MoveOffset == 1);
        Assert.Contains(outcomes, o => o.Target == OutcomeTarget.NonMuslims && o.Kind == OutcomeKind.MoveByOffset && o.MoveOffset == -1);
    }

    [Theory]
    // 1. Crusades - all players roll.
    [InlineData(1, 1, OutcomeKind.Eliminate, 0)]
    [InlineData(1, 2, OutcomeKind.None, 0)]
    [InlineData(1, 4, OutcomeKind.None, 0)]
    [InlineData(1, 5, OutcomeKind.MoveByOffset, 3)]
    [InlineData(1, 6, OutcomeKind.MoveByOffset, 3)]
    // 4. Appendicitis (regression: confirmed ranges 1-2 / 3-6, not the 1-4 / 5-6 of the OCR source).
    [InlineData(4, 1, OutcomeKind.None, 0)]
    [InlineData(4, 2, OutcomeKind.None, 0)]
    [InlineData(4, 3, OutcomeKind.Eliminate, 0)]
    [InlineData(4, 6, OutcomeKind.Eliminate, 0)]
    // 8. Monastery beer.
    [InlineData(8, 1, OutcomeKind.SkipTurns, 2)]
    [InlineData(8, 2, OutcomeKind.None, 0)]
    [InlineData(8, 6, OutcomeKind.None, 0)]
    // 9. Castle under siege.
    [InlineData(9, 1, OutcomeKind.SkipTurns, 1)]
    [InlineData(9, 3, OutcomeKind.SkipTurns, 1)]
    [InlineData(9, 4, OutcomeKind.MoveByOffset, 1)]
    [InlineData(9, 6, OutcomeKind.MoveByOffset, 1)]
    // 10. Peasant uprising.
    [InlineData(10, 1, OutcomeKind.SkipTurns, 2)]
    [InlineData(10, 3, OutcomeKind.SkipTurns, 2)]
    [InlineData(10, 4, OutcomeKind.None, 0)]
    [InlineData(10, 6, OutcomeKind.None, 0)]
    // 14. Children in a monastery.
    [InlineData(14, 1, OutcomeKind.SkipTurns, 2)]
    [InlineData(14, 3, OutcomeKind.SkipTurns, 2)]
    [InlineData(14, 4, OutcomeKind.None, 0)]
    [InlineData(14, 6, OutcomeKind.None, 0)]
    // 16. Plague (regression: confirmed ranges 1-3 / 4-6, not the 1-4 / 5-6 of the OCR source).
    [InlineData(16, 1, OutcomeKind.None, 0)]
    [InlineData(16, 3, OutcomeKind.None, 0)]
    [InlineData(16, 4, OutcomeKind.Eliminate, 0)]
    [InlineData(16, 6, OutcomeKind.Eliminate, 0)]
    // 18. Malleus Maleficarum - women roll, a 6 is out.
    [InlineData(18, 1, OutcomeKind.None, 0)]
    [InlineData(18, 5, OutcomeKind.None, 0)]
    [InlineData(18, 6, OutcomeKind.Eliminate, 0)]
    // 20. Leonardo da Vinci.
    [InlineData(20, 1, OutcomeKind.SkipTurns, 1)]
    [InlineData(20, 2, OutcomeKind.SkipTurns, 1)]
    [InlineData(20, 3, OutcomeKind.None, 0)]
    [InlineData(20, 4, OutcomeKind.None, 0)]
    [InlineData(20, 5, OutcomeKind.None, 0)]
    [InlineData(20, 6, OutcomeKind.None, 0)]
    // 21. Discovery of America.
    [InlineData(21, 1, OutcomeKind.SkipTurns, 1)]
    [InlineData(21, 2, OutcomeKind.SkipTurns, 1)]
    [InlineData(21, 3, OutcomeKind.None, 0)]
    [InlineData(21, 6, OutcomeKind.None, 0)]
    // 22. Reformation.
    [InlineData(22, 1, OutcomeKind.SkipTurns, 1)]
    [InlineData(22, 2, OutcomeKind.SkipTurns, 1)]
    [InlineData(22, 3, OutcomeKind.None, 0)]
    [InlineData(22, 6, OutcomeKind.None, 0)]
    // 24. Thirty Years' War.
    [InlineData(24, 1, OutcomeKind.Eliminate, 0)]
    [InlineData(24, 2, OutcomeKind.Eliminate, 0)]
    [InlineData(24, 3, OutcomeKind.SkipTurns, 2)]
    [InlineData(24, 6, OutcomeKind.SkipTurns, 2)]
    // 27. Telescope.
    [InlineData(27, 1, OutcomeKind.SkipTurns, 1)]
    [InlineData(27, 2, OutcomeKind.SkipTurns, 1)]
    [InlineData(27, 3, OutcomeKind.Eliminate, 0)]
    [InlineData(27, 4, OutcomeKind.Eliminate, 0)]
    [InlineData(27, 5, OutcomeKind.MoveByOffset, 3)]
    [InlineData(27, 6, OutcomeKind.MoveByOffset, 3)]
    // 29. Industrialization (regression: the 2-turn skip belongs to 4-6).
    [InlineData(29, 1, OutcomeKind.None, 0)]
    [InlineData(29, 3, OutcomeKind.None, 0)]
    [InlineData(29, 4, OutcomeKind.SkipTurns, 2)]
    [InlineData(29, 6, OutcomeKind.SkipTurns, 2)]
    public void Roll_event_maps_die_face_to_outcome(int eventNumber, int face, OutcomeKind kind, int value)
    {
        var gameEvent = Storage.Events[eventNumber];

        Assert.Equal(EventResolutionMode.Roll, gameEvent.ResolutionMode);
        var outcome = gameEvent.RollOutcomes.Single(o => o.Range.InRange(face)).Outcome;
        AssertOutcome(outcome, kind, value);
    }

    [Theory]
    [InlineData(1, OutcomeTarget.AllPlayers)]
    [InlineData(18, OutcomeTarget.Women)]
    [InlineData(4, OutcomeTarget.CurrentPlayer)]
    [InlineData(24, OutcomeTarget.CurrentPlayer)]
    public void Roll_event_targets_one_player_group(int eventNumber, OutcomeTarget target)
    {
        Assert.All(Storage.Events[eventNumber].RollOutcomes, o => Assert.Equal(target, o.Outcome.Target));
    }

    private static void AssertOutcome(EventOutcome outcome, OutcomeKind kind, int value)
    {
        Assert.Equal(kind, outcome.Kind);
        switch (kind)
        {
            case OutcomeKind.MoveByOffset:
                Assert.Equal(value, outcome.MoveOffset);
                break;
            case OutcomeKind.MoveToCell:
                Assert.Equal(value, outcome.MoveToCell);
                break;
            case OutcomeKind.SkipTurns:
                Assert.Equal(value, outcome.SkipTurns);
                break;
        }
    }
}
