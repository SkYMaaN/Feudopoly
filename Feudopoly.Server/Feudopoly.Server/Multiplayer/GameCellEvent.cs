namespace Feudopoly.Server.Multiplayer
{
    public sealed class GameCellEvent
    {
        public required Guid Id { get; init; }

        public required string Title { get; init; }

        public required string Description { get; init; }

        public string DictorSpeech { get; init; } = string.Empty;

        public required EventResolutionMode ResolutionMode { get; init; }

        public IReadOnlyList<EventOutcome> FixedOutcomes { get; init; } = [];

        public IReadOnlyList<RollOutcome> RollOutcomes { get; init; } = [];

        public override string ToString() => $"{Title}: {Description}";
    }

    public enum EventResolutionMode
    {
        Fixed,
        Roll
    }

    public enum OutcomeTarget
    {
        CurrentPlayer,
        ChosenPlayer,
        AllPlayers,
        Women,
        Muslims,
        NonMuslims
    }

    public enum OutcomeKind
    {
        None,
        MoveByOffset,
        MoveToCell,
        RepeatRoll,
        SkipTurns,
        Eliminate
    }

    public enum RollResultKind
    {
        Lose,
        Tie,
        Win
    }

    public sealed class EventOutcome
    {
        public required OutcomeKind Kind { get; init; }

        public required OutcomeTarget Target { get; init; }

        public string Text { get; init; } = string.Empty;

        public int MoveOffset { get; init; }

        public int? MoveToCell { get; init; }

        public int SkipTurns { get; init; }
    }

    public sealed class RollOutcome
    {
        public required RollResultKind ResultKind { get; init; }

        public required IntRange Range { get; init; }

        public required EventOutcome Outcome { get; init; }
    }

    public readonly struct IntRange
    {
        public int From { get; }
        public int To { get; }

        public IntRange(int from, int to)
        {
            if (from > to)
            {
                throw new ArgumentException("from must be <= to");
            }

            From = from;
            To = to;
        }

        public bool InRange(int value) => value >= From && value <= To;
    }
}
