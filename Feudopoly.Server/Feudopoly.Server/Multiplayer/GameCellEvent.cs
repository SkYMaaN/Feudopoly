namespace Feudopoly.Server.Multiplayer
{
    public sealed class GameCellEvent
    {
        public required Guid Id { get; init; }

        public required string Title { get; init; }

        public required string Description { get; init; }

        public IntRange WinRange { get; init; }

        public string WinText { get; init; }

        public IntRange TieRange { get; init; }

        public string TieText { get; init; }

        public IntRange LoseRange { get; init; }

        public string LoseText { get; init; }

        public string DictorSpeech { get; init; }

        public bool HasDeathOutcome { get; init; }

        public int MoveOffset { get; init; }

        public override string ToString()
        {
            return $"{Title}: {Description}";
        }
    }

    public readonly struct IntRange
    {
        public int From { get; }
        public int To { get; }

        public IntRange(int from, int to)
        {
            if (from > to)
                throw new ArgumentException("from must be <= to");

            From = from;
            To = to;
        }

        public bool InRange(int value) => value >= From && value <= To;
    }
}
