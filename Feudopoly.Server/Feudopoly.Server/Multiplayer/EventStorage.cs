using System.Collections.Frozen;

namespace Feudopoly.Server.Multiplayer
{
    public sealed class EventStorage
    {
        public FrozenDictionary<int, GameCellEvent> Events;

        private static IntRange R(int from, int to) => new(from, to);

        private static EventOutcome O(
            OutcomeKind kind,
            string text,
            OutcomeTarget target = OutcomeTarget.CurrentPlayer,
            int moveOffset = 0,
            int? moveToCell = null,
            int skipTurns = 0) =>
            new()
            {
                Kind = kind,
                Text = text,
                Target = target,
                MoveOffset = moveOffset,
                MoveToCell = moveToCell,
                SkipTurns = skipTurns
            };

        private static RollOutcome RO(RollResultKind kind, IntRange range, EventOutcome outcome) =>
            new() { ResultKind = kind, Range = range, Outcome = outcome };

        public EventStorage() => FillEvents();

        private void FillEvents()
        {
            var dictionary = new Dictionary<int, GameCellEvent>
            {
                [1] = Roll("Crusades! And they concern everyone!", "All players have to roll the dice.",
                    RO(RollResultKind.Lose, R(1, 1), O(OutcomeKind.Eliminate, "You die heroically for the faith.", OutcomeTarget.AllPlayers)),
                    RO(RollResultKind.Tie, R(2, 4), O(OutcomeKind.None, "You dodged the bullet in time and now you're preaching peace. Nothing happens.", OutcomeTarget.AllPlayers)),
                    RO(RollResultKind.Win, R(5, 6), O(OutcomeKind.MoveByOffset, "You returned with wealth. Move forward 3 spaces.", OutcomeTarget.AllPlayers, moveOffset: 3))),

                [2] = Fixed("Franciscan Order", "You are joining the Franciscan Order. No possessions, no luxury – only humility. Look within yourself. Skip 2 rounds.",
                    O(OutcomeKind.SkipTurns, "Skip 2 rounds.", skipTurns: 2)),

                [3] = Fixed("Age of knights", "It's the age of knights and you are one of them from within. Roll the dice again.",
                    O(OutcomeKind.RepeatRoll, "Roll the dice again.")),

                [4] = Roll("Appendicitis", "Believe me – you wouldn't want that in the year 1200! Roll again.",
                    RO(RollResultKind.Win, R(1, 4), O(OutcomeKind.None, "You survived.")),
                    RO(RollResultKind.Lose, R(5, 6), O(OutcomeKind.Eliminate, "You'll die from the infection. It's not called the \"Dark Ages\" for nothing."))),

                [5] = Fixed("Festival nobleman", "You were bumped into by a man at a festival, and you confronted him about it. It turned out he was a nobleman. You are skipping a turn.",
                    O(OutcomeKind.SkipTurns, "Skip 1 turn.", skipTurns: 1)),

                [6] = Fixed("Farmers starving", "Your farmers are starving and it's your fault. Go back 2 spaces.",
                    O(OutcomeKind.MoveByOffset, "Go back 2 spaces.", moveOffset: -2)),

                [7] = Fixed("Hardworking farmers", "Your farmers were hardworking! Move forward 2 spaces.",
                    O(OutcomeKind.MoveByOffset, "Move forward 2 spaces.", moveOffset: 2)),

                [8] = Roll("Monks brew beer", "You're visiting monks who brew beer. You weren't aware of your alcohol problem before. Roll again.",
                    RO(RollResultKind.Lose, R(1, 1), O(OutcomeKind.SkipTurns, "Stay 2 moves with the monks.", skipTurns: 2)),
                    RO(RollResultKind.Tie, R(2, 6), O(OutcomeKind.None, "Next time you may go."))),

                [9] = Roll("Castle under siege", "Your castle is under siege. Roll again.",
                    RO(RollResultKind.Lose, R(1, 3), O(OutcomeKind.SkipTurns, "Your castle has fallen. You managed to hide in time. Skip 1 round.", skipTurns: 1)),
                    RO(RollResultKind.Win, R(4, 6), O(OutcomeKind.MoveByOffset, "You could defend the castle. Call out \"Long live King Henry!\" and go forward 1 space.", moveOffset: 1))),

                [10] = Roll("Peasant uprising", "It's a peasant uprising and you're a nobleman. Roll again.",
                    RO(RollResultKind.Lose, R(1, 3), O(OutcomeKind.SkipTurns, "Your castle is being plundered. Skip 2 moves.", skipTurns: 2)),
                    RO(RollResultKind.Tie, R(4, 6), O(OutcomeKind.None, "You dressed up as a farmer. Good idea! Smile and be happy. It could be worse."))),

                [11] = Fixed("Visit the Pope", "You went to see the Pope and you were very successful at sucking up to him. Move forward 1 space.",
                    O(OutcomeKind.MoveByOffset, "Move forward 1 space.", moveOffset: 1)),

                [12] = Fixed("Spy for the Inquisition", "You are a spy for the Inquisition. A player of your choice moves back 5 spaces. The Vatican is proud of you.",
                    O(OutcomeKind.MoveByOffset, "A chosen player moves back 5 spaces.", OutcomeTarget.ChosenPlayer, moveOffset: -5)),

                [13] = Fixed("Sell indulgences", "You managed to sell 12 indulgences for the same sin to an illiterate person. God will forgive you, if you truly believe. Move forward 1 space.",
                    O(OutcomeKind.MoveByOffset, "Move forward 1 space.", moveOffset: 1)),

                [14] = Roll("Children to monastery", "All your children go to a monastery. Roll again.",
                    [
                        RO(RollResultKind.Lose, R(1, 3), O(OutcomeKind.SkipTurns, "You will never have grandchildren. Skip 2 moves. Religion also has disadvantages.", skipTurns: 2)),
                        RO(RollResultKind.Tie, R(4, 6), O(OutcomeKind.None, "The children found the monastery too strenuous. We were lucky again!"))
                    ],
                    "Religion also has disadvantages."),

                [15] = Fixed("Bullied kid becomes Pope", "The guy you beat up as a kid becomes Pope. You argue that a Christian must forgive. He promised to think about it. You flee on field 8.",
                    O(OutcomeKind.MoveToCell, "Move immediately to field 8.", moveToCell: 8)),

                [16] = Roll("Plague", "The plague hit hard. Roll again.",
                    RO(RollResultKind.Win, R(1, 4), O(OutcomeKind.None, "You were lucky, life goes on.")),
                    RO(RollResultKind.Lose, R(5, 6), O(OutcomeKind.Eliminate, "You had the plague."))),

                [17] = Fixed("Printing press invented", "The printing press was invented. Rejoice. You will be significantly better off in just 500 years because of this.",
                    O(OutcomeKind.None, "Nothing happens."), "Rejoice."),

                [18] = Roll("Malleus Maleficarum", "You are on the field Malleus Maleficarum. All women in the game have to roll the dice.",
                    [
                        RO(RollResultKind.Lose, R(6, 6), O(OutcomeKind.Eliminate, "Anyone who rolls a 6 is out of the game.", OutcomeTarget.Women)),
                        RO(RollResultKind.Tie, R(1, 5), O(OutcomeKind.None, "The others were lucky.", OutcomeTarget.Women))
                    ],
                    "It\'s not called \"the Dark Ages\" for nothing."),

                [19] = Fixed("Looked out the window", "While others were learning to read, you were looking out the window (yes, for the entire 8 years). Go back to field 17.",
                    O(OutcomeKind.MoveToCell, "Move immediately to field 17.", moveToCell: 17)),

                [20] = Roll("da Vinci helicopter", "Leonardo da Vinci draws a helicopter. Roll again.",
                    [
                        RO(RollResultKind.Lose, R(1, 2), O(OutcomeKind.SkipTurns, "You think it's the devil's work -> suspend a turn. If you don't want progress, don't stop others from making it.", skipTurns: 1)),
                        RO(RollResultKind.Tie, R(3, 4), O(OutcomeKind.None, "You don't care. Smile and be happy. You are not capable of more than that.")),
                        RO(RollResultKind.Win, R(5, 6), O(OutcomeKind.RepeatRoll, "You have difficulty forming your own opinion. Pass the cube on."))
                    ],
                    "If you don't want progress, don't stop others from making it."),

                [21] = Roll("1492 America rediscovered", "It is the year 1492, America is rediscovered. Roll again.",
                    [
                        RO(RollResultKind.Lose, R(1, 2), O(OutcomeKind.SkipTurns, "You're sad because you actually wanted Indian spices -> suspend a turn.", skipTurns: 1)),
                        RO(RollResultKind.Tie, R(3, 4), O(OutcomeKind.None, "You set off but didn't arrive – the sea was simply too rough.")),
                        RO(RollResultKind.Win, R(5, 6), O(OutcomeKind.None, "You can't read, you know nothing about America -> smile and be glad. You are not capable of more than that."))
                    ],
                    "Smile and be happy. It could be worse."),

                [22] = Roll("The Reformation", "For some it's good, for others not. Roll again.",
                    RO(RollResultKind.Win, R(1, 2), O(OutcomeKind.SkipTurns, "Actually, you love confessions and incense. You are sad and suspend a turn.", skipTurns: 1)),
                    RO(RollResultKind.Tie, R(3, 4), O(OutcomeKind.None, "The priest now legal. You think it's good to be able to have a woman. Smile and be happy. It could be worse.")),
                    RO(RollResultKind.Lose, R(5, 6), O(OutcomeKind.None, "You're basically worshipping the tooth fairy. Smile and be happy. It could be worse."))),

                [23] = Fixed("Confessions and incense", "Actually, you love confessions and incense. You are sad and suspend a turn. The priest now legal: you think it's good to be able to have a woman. Smile and be happy. It could be worse.",
                    O(OutcomeKind.SkipTurns, "Suspend a turn.", skipTurns: 1), "Smile and be happy. It could be worse."),

                [24] = Fixed("Ottomans strong", "The Ottomans are currently strong. All Muslims move forward one space. All others move back one space.",
                    O(OutcomeKind.MoveByOffset, "All Muslims move forward one space.", OutcomeTarget.Muslims, moveOffset: 1),
                    O(OutcomeKind.MoveByOffset, "All others move back one space.", OutcomeTarget.NonMuslims, moveOffset: -1)),

                [25] = Roll("Thirty Years' War", "The Thirty Years' War mercilessly paralyzes all of Europe. Roll again.",
                    RO(RollResultKind.Lose, R(1, 1), O(OutcomeKind.Eliminate, "You die in battle.")),
                    RO(RollResultKind.Tie, R(2, 2), O(OutcomeKind.Eliminate, "You die without ever having fought.")),
                    RO(RollResultKind.Win, R(3, 6), O(OutcomeKind.SkipTurns, "Skip 2 moves.", skipTurns: 2))),

                [26] = Fixed("Peace after war", "Peace comes after war. Smile and be happy. Try to recover until the next war.",
                    O(OutcomeKind.None, "Nothing happens."), "Smile and be happy."),

                [27] = Fixed("Banker in Florence", "You become a banker in Florence. The Pope needs a loan – you gladly help (for an interest rate, of course). Move forward 2 spaces.",
                    O(OutcomeKind.MoveByOffset, "Move forward 2 spaces.", moveOffset: 2)),

                [28] = Roll("Telescope discoveries", "You observe the sky with a telescope, discover many new things, and publish a book about it. The church takes notice of you. Roll again.",
                    [
                        RO(RollResultKind.Tie, R(1, 2), O(OutcomeKind.SkipTurns, "You recant your discoveries and beg for mercy. Skip 1 move.", skipTurns: 1)),
                        RO(RollResultKind.Lose, R(3, 4), O(OutcomeKind.Eliminate, "You will be accused of heresy and end up at the stake.")),
                        RO(RollResultKind.Win, R(5, 6), O(OutcomeKind.MoveByOffset, "You are revolutionizing science - go forward 3 spaces, you survived!", moveOffset: 3))
                    ],
                    "You survived!"),

                [29] = Roll("Industrialization begins", "Industrialization begins. Roll again.",
                    [
                        RO(RollResultKind.Lose, R(1, 3), O(OutcomeKind.None, "Rejoice. You will be significantly better off in just 200 years because of this")),
                        RO(RollResultKind.Win, R(4, 6), O(OutcomeKind.SkipTurns, "You prefer honest, manual labor in the field - even if you're pulling the plow yourself. Skip 2 moves", skipTurns: 2))
                    ],
                    "Rejoice.")
            };

            Events = dictionary.ToFrozenDictionary();
        }

        private static GameCellEvent Fixed(string title, string description, params EventOutcome[] outcomes) =>
            Fixed(title, description, outcomes, string.Empty);

        private static GameCellEvent Fixed(string title, string description, EventOutcome outcome, string dictorSpeech) =>
            Fixed(title, description, [outcome], dictorSpeech);

        private static GameCellEvent Fixed(string title, string description, EventOutcome[] outcomes, string dictorSpeech) =>
            new()
            {
                Id = Guid.NewGuid(),
                Title = title,
                Description = description,
                DictorSpeech = dictorSpeech,
                ResolutionMode = EventResolutionMode.Fixed,
                FixedOutcomes = outcomes,
                RollOutcomes = []
            };

        private static GameCellEvent Roll(string title, string description, params RollOutcome[] outcomes) =>
            Roll(title, description, outcomes, string.Empty);

        private static GameCellEvent Roll(string title, string description, RollOutcome[] outcomes, string dictorSpeech) =>
            new()
            {
                Id = Guid.NewGuid(),
                Title = title,
                Description = description,
                DictorSpeech = dictorSpeech,
                ResolutionMode = EventResolutionMode.Roll,
                FixedOutcomes = [],
                RollOutcomes = outcomes
            };
    }
}
