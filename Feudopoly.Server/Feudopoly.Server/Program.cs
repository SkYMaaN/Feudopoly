using Feudopoly.Server.Hubs;
using Feudopoly.Server.Multiplayer;
using Microsoft.AspNetCore.HttpOverrides;

namespace Feudopoly.Server
{
    public class Program
    {
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
            builder.Services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
                options.KnownNetworks.Clear();
                options.KnownProxies.Clear();
            });

            var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                ?? new[]
                {
                    "http://localhost:8083",
                    "http://localhost:8084",
                    "http://localhost:8085",
                    "http://localhost:8086",
                    "http://localhost:8087"
                };

            builder.Services.AddCors(options =>
            {
                options.AddPolicy("ClientPolicy", policy =>
                {
                    policy
                        .WithOrigins(allowedOrigins)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                });
            });

            var app = builder.Build();

            if (app.Environment.IsDevelopment())
            {
                app.MapOpenApi();
            }

            app.UseForwardedHeaders();
            app.UseCors("ClientPolicy");
            app.UseHttpsRedirection();
            app.UseAuthorization();

            app.MapControllers();
            app.MapHub<GameHub>("/hubs/game");
            app.MapHub<LobbyHub>("/hubs/lobby");

            app.Run();
        }
    }
}
