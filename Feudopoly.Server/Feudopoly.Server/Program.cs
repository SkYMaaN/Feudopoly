using Feudopoly.Server.Hubs;
using Feudopoly.Server.Infrastructure;
using Feudopoly.Server.Multiplayer;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;

namespace Feudopoly.Server
{
    public class Program
    {
        private const string DefaultCorsPolicy = "FeudopolyCORS_054389w763";
        public const string OpenCorsPolicy = "FeudopolyOpenCors";

        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            builder.Services.AddControllers();
            builder.Services.AddEndpointsApiExplorer();
            builder.Services.Configure<SwaggerAdminOptions>(_ =>
            {
                _.Password = Environment.GetEnvironmentVariable(SwaggerAdminOptions.PasswordEnvironmentVariable, EnvironmentVariableTarget.User);
            });
            builder.Services.AddSwaggerGen(options =>
            {
                options.SwaggerDoc("v1", new OpenApiInfo
                {
                    Title = "Feudopoly Admin API",
                    Version = "v1",
                    Description = "Internal lobby administration endpoints."
                });
            });
            builder.Services.AddSignalR(options =>
            {
                options.ClientTimeoutInterval = TimeSpan.FromMinutes(20);
                options.KeepAliveInterval = TimeSpan.FromMinutes(2);
                options.EnableDetailedErrors = true;
            });
            builder.Services.AddSingleton<SessionStorage>();
            builder.Services.AddSingleton<EventStorage>();

            var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

            builder.Services.AddCors(options =>
            {
                options.AddPolicy(DefaultCorsPolicy, policy =>
                {
                    policy.WithOrigins(allowedOrigins)
                        .AllowAnyHeader()
                        .AllowAnyMethod()
                        .AllowCredentials();
                });

                options.AddPolicy(OpenCorsPolicy, policy =>
                {
                    policy.AllowAnyOrigin()
                        .AllowAnyHeader()
                        .AllowAnyMethod();
                });
            });

            var app = builder.Build();
            var swaggerAdminOptions = app.Services.GetRequiredService<IOptions<SwaggerAdminOptions>>().Value;
            var logger = app.Services.GetRequiredService<ILogger<Program>>();
            logger.LogInformation("Application started!");
            logger.LogInformation("Allowed origins: {AllowedOrigins}", string.Join("\n", allowedOrigins));

            if (swaggerAdminOptions.IsEnabled)
            {
                app.UseMiddleware<SwaggerBasicAuthMiddleware>();
                app.UseSwagger(options =>
                {
                    options.RouteTemplate = SwaggerAdminOptions.JsonRouteTemplate;
                });
                app.UseSwaggerUI(options =>
                {
                    options.RoutePrefix = SwaggerAdminOptions.UiRoutePrefix;
                    options.SwaggerEndpoint(SwaggerAdminOptions.JsonEndpoint, "Feudopoly Admin API v1");
                    options.DocumentTitle = "Feudopoly Admin";
                });
            }
            else
            {
                logger.LogInformation(
                    "Swagger UI is disabled because environment variable {EnvironmentVariable} is not set.",
                    SwaggerAdminOptions.PasswordEnvironmentVariable);
            }

            app.UseHttpsRedirection();
            app.UseCors(DefaultCorsPolicy);
            app.UseAuthorization();

            app.MapControllers();
            app.MapHub<GameHub>("/hubs/game");
            app.MapHub<LobbyHub>("/hubs/lobby");

            app.Run();
        }
    }
}
