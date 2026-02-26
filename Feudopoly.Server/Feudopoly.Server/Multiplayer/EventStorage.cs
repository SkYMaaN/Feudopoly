using System.Collections.Frozen;

namespace Feudopoly.Server.Multiplayer
{
    public sealed class EventStorage
    {
        public FrozenDictionary<int, GameCellEvent> Events;

        private static IntRange R(int from, int to) => new(from, to);

        public EventStorage() => FillEvents();

        private void FillEvents()
        {
            var dictionary = new Dictionary<int, GameCellEvent>();

            // 1
            dictionary[1] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Crusades! And they concern everyone!",
                Description = "All players have to roll the dice.",
                LoseRange = R(1, 1),
                LoseText = "You die heroically for the faith.",
                TieRange = R(2, 4),
                TieText = "You dodged the bullet in time and now you're preaching peace. Nothing happens.",
                WinRange = R(5, 6),
                WinText = "You returned with wealth. Move forward 3 spaces.",
                DictorSpeech = "",
                HasDeathOutcome = true,
                MoveOffset = 3
            };

            // 2
            dictionary[2] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Franciscan Order",
                Description = "You are joining the Franciscan Order. No possessions, no luxury – only humility. Look within yourself. Skip 2 rounds.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 3
            dictionary[3] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Age of knights",
                Description = "It's the age of knights and you are one of them from within. Roll the dice again.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 4
            dictionary[4] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Appendicitis",
                Description = "Believe me – you wouldn't want that in the year 1200! Roll again.",
                WinRange = R(1, 4),
                WinText = "You survived.",
                LoseRange = R(5, 6),
                LoseText = "You'll die from the infection. It's not called the \"Dark Ages\" for nothing.",
                DictorSpeech = "",
                HasDeathOutcome = true,
                MoveOffset = 0
            };

            // 5
            dictionary[5] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Festival nobleman",
                Description = "You were bumped into by a man at a festival, and you confronted him about it. It turned out he was a nobleman. You are skipping a turn.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 6
            dictionary[6] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Farmers starving",
                Description = "Your farmers are starving and it's your fault. Go back 2 spaces.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = -2
            };

            // 7
            dictionary[7] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Hardworking farmers",
                Description = "Your farmers were hardworking! Move forward 2 spaces.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 2
            };

            // 8
            dictionary[8] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Monks brew beer",
                Description = "You're visiting monks who brew beer. You weren't aware of your alcohol problem before. Roll again.",
                LoseRange = R(1, 1),
                LoseText = "Stay 2 moves with the monks.",
                TieRange = R(2, 6),
                TieText = "Next time you may go.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 9
            dictionary[9] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Castle under siege",
                Description = "Your castle is under siege. Roll again.",
                LoseRange = R(1, 3),
                LoseText = "Your castle has fallen. You managed to hide in time. Skip 1 round.",
                WinRange = R(4, 6),
                WinText = "You could defend the castle. Call out \"Long live King Henry!\" and go forward 1 space.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 1
            };

            // 10
            dictionary[10] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Peasant uprising",
                Description = "It's a peasant uprising and you're a nobleman. Roll again.",
                LoseRange = R(1, 3),
                LoseText = "Your castle is being plundered. Skip 2 moves.",
                TieRange = R(4, 6),
                TieText = "You dressed up as a farmer. Good idea! Smile and be happy. It could be worse.",
                DictorSpeech = "Smile and be happy. It could be worse.",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 11
            dictionary[11] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Visit the Pope",
                Description = "You went to see the Pope and you were very successful at sucking up to him. Move forward 1 space.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 1
            };

            // 12
            dictionary[12] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Spy for the Inquisition",
                Description = "You are a spy for the Inquisition. A player of your choice moves back 5 spaces. The Vatican is proud of you.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0 // смещение применимо не к текущему игроку
            };

            // 13
            dictionary[13] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Sell indulgences",
                Description = "You managed to sell 12 indulgences for the same sin to an illiterate person. God will forgive you, if you truly believe. Move forward 1 space.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 1
            };

            // 14
            dictionary[14] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Children to monastery",
                Description = "All your children go to a monastery. Roll again.",
                LoseRange = R(1, 3),
                LoseText = "You will never have grandchildren. Skip 2 moves. Religion also has disadvantages.",
                TieRange = R(4, 6),
                TieText = "The children found the monastery too strenuous. We were lucky again!",
                DictorSpeech = "Religion also has disadvantages.",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 15
            dictionary[15] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Bullied kid becomes Pope",
                Description = "The guy you beat up as a kid becomes Pope. You argue that a Christian must forgive. He promised to think about it. You flee on field 8.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 16
            dictionary[16] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Plague",
                Description = "The plague hit hard. Roll again.",
                WinRange = R(1, 4),
                WinText = "You were lucky, life goes on.",
                LoseRange = R(5, 6),
                LoseText = "You had the plague.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 17
            dictionary[17] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Printing press invented",
                Description = "The printing press was invented. Rejoice. You will be significantly better off in just 500 years because of this.",
                DictorSpeech = "Rejoice.",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 18
            dictionary[18] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Malleus Maleficarum",
                Description = "You are on the field Malleus Maleficarum. All women in the game have to roll the dice.",
                LoseRange = R(6, 6),
                LoseText = "Anyone who rolls a 6 is out of the game.",
                TieRange = R(1, 5),
                TieText = "The others were lucky.",
                DictorSpeech = "It's not called \"the Dark Ages\" for nothing.",
                HasDeathOutcome = true,
                MoveOffset = 0
            };

            // 19
            dictionary[19] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Looked out the window",
                Description = "While others were learning to read, you were looking out the window (yes, for the entire 8 years). Go back to field 17.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 20
            dictionary[20] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "da Vinci helicopter",
                Description = "Leonardo da Vinci draws a helicopter. Roll again.",
                LoseRange = R(1, 2),
                LoseText = "You think it's the devil's work -> suspend a turn. If you don't want progress, don't stop others from making it.",
                TieRange = R(3, 4),
                TieText = "You don't care. Smile and be happy. You are not capable of more than that.",
                WinRange = R(5, 6),
                WinText = "You have difficulty forming your own opinion. Pass the cube on.",
                DictorSpeech = "If you don't want progress, don't stop others from making it.",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 21
            dictionary[21] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "1492 America rediscovered",
                Description = "It is the year 1492, America is rediscovered. Roll again.",
                LoseRange = R(1, 2),
                LoseText = "You're sad because you actually wanted Indian spices -> suspend a turn.",
                TieRange = R(3, 4),
                TieText = "You set off but didn't arrive – the sea was simply too rough.",
                WinRange = R(5, 6),
                WinText = "You can't read, you know nothing about America -> smile and be glad. You are not capable of more than that.",
                DictorSpeech = "Smile and be happy. It could be worse.",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 22
            dictionary[22] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "The Reformation",
                Description = "For some it's good, for others not. Roll again.",
                WinRange = new IntRange(1, 2),
                WinText = "Actually, you love confessions and incense. You are sad and suspends a train.",
                TieRange = new IntRange(3, 4),
                TieText = "The priest now legal. You think it's good to be able to have a woman. Smile and be happy. It could be worse.",
                LoseRange = new IntRange(5, 6),
                LoseText = "You're basically worshipping the tooth fairy. Smile and be happy. It could be worse.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 23
            dictionary[23] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Confessions and incense",
                Description = "Actually, you love confessions and incense. You are sad and suspend a turn. The priest now legal: you think it's good to be able to have a woman. Smile and be happy. It could be worse.",
                DictorSpeech = "Smile and be happy. It could be worse.",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 24
            dictionary[24] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Ottomans strong",
                Description = "The Ottomans are currently strong. All Muslims move forward one space. All others move back one space.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 25
            dictionary[25] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Thirty Years' War",
                Description = "The Thirty Years' War mercilessly paralyzes all of Europe. Roll again.",
                LoseRange = R(1, 1),
                LoseText = "You die in battle.",
                TieRange = R(2, 2),
                TieText = "You die without ever having fought.",
                WinRange = R(3, 6),
                WinText = "Skip 2 moves.",
                DictorSpeech = "",
                HasDeathOutcome = true,
                MoveOffset = 0
            };

            // 26
            dictionary[26] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Peace after war",
                Description = "Peace comes after war. Smile and be happy. Try to recover until the next war.",
                DictorSpeech = "Smile and be happy.",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            // 27
            dictionary[27] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Banker in Florence",
                Description = "You become a banker in Florence. The Pope needs a loan – you gladly help (for an interest rate, of course). Move forward 2 spaces.",
                DictorSpeech = "",
                HasDeathOutcome = false,
                MoveOffset = 2
            };

            // 28
            dictionary[28] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Telescope discoveries",
                Description = "You observe the sky with a telescope, discover many new things, and publish a book about it. The church takes notice of you. Roll again.",
                TieRange = R(1, 2),
                TieText = "You recant your discoveries and beg for mercy. Skip 1 move.",
                LoseRange = R(3, 4),
                LoseText = "You will be accused of heresy and end up at the stake.",
                WinRange = R(5, 6),
                WinText = "You are revolutionizing science - go forward 3 spaces, you survived!",
                DictorSpeech = "You survived!",
                HasDeathOutcome = true,
                MoveOffset = 3
            };

            // 29
            dictionary[29] = new GameCellEvent
            {
                Id = Guid.NewGuid(),
                Title = "Industrialization begins",
                Description = "Industrialization begins. Roll again.",
                LoseRange = R(1, 3),
                LoseText = "Rejoice. You will be significantly better off in just 200 years because of this",
                WinRange = R(4, 6),
                WinText = "You prefer honest, manual labor in the field - even if you're pulling the plow yourself. Skip 2 moves",
                DictorSpeech = "Rejoice.",
                HasDeathOutcome = false,
                MoveOffset = 0
            };

            Events = dictionary.ToFrozenDictionary();
        }
    }
}
