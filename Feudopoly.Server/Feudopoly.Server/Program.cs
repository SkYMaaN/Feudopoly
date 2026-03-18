using Feudopoly.Server.Hubs;
using Feudopoly.Server.Multiplayer;

namespace Feudopoly.Server
{
    public class Program
    {
        private const string CORSKey = "FeudopolyCORS_054389w763";

        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            builder.Services.AddControllers();
            builder.Services.AddOpenApi();
            builder.Services.AddSignalR(options =>
            {
                options.ClientTimeoutInterval = TimeSpan.FromMinutes(20);
                options.KeepAliveInterval = TimeSpan.FromMinutes(2);
                options.EnableDetailedErrors = true;
            });
            builder.Services.AddSingleton<SessionStorage>();
            builder.Services.AddSingleton<EventStorage>();

            var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();

            builder.Services.AddCors(options =>
            {
                options.AddPolicy(CORSKey, policy =>
                {
                    policy.WithOrigins(allowedOrigins)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                });
            });

            var app = builder.Build();
            var logger = app.Services.GetRequiredService<ILogger<Program>>();
            logger.LogInformation("Application started!");
            // log allowedOrigins
            logger.LogInformation("Allowed origins: " + String.Join("\n", allowedOrigins));

            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }

            app.UseHttpsRedirection();
            app.UseCors(CORSKey);
            app.UseAuthorization();

            app.MapControllers();
            app.MapHub<GameHub>("/hubs/game");
            app.MapHub<LobbyHub>("/hubs/lobby");

            app.Run();
        }
    }
}
