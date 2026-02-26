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
            builder.Services.AddSingleton<SessionStorage>();
            builder.Services.AddSingleton<EventStorage>();
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("ClientPolicy", policy =>
                {
                    policy
                        .WithOrigins("http://localhost:8083", "http://localhost:8084", "http://localhost:8085", "http://localhost:8086", "http://localhost:8087")
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
