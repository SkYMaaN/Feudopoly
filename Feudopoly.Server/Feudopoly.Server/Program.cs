using Feudopoly.Server.Hubs;
using Feudopoly.Server.Multiplayer;

namespace Feudopoly.Server
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            builder.Services.AddControllers();
            builder.Services.AddOpenApi();
            builder.Services.AddSignalR();
            builder.Services.AddSingleton<SessionStore>();
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("ClientPolicy", policy =>
                {
                    policy
                        .SetIsOriginAllowed(_ => true)
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

            app.UseHttpsRedirection();
            app.UseCors("ClientPolicy");
            app.UseAuthorization();

            app.MapControllers();
            app.MapHub<GameHub>("/hubs/game");

            app.Run();
        }
    }
}
