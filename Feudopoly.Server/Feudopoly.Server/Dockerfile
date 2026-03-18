# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY Feudopoly.Server/Feudopoly.Server/Feudopoly.Server.csproj Feudopoly.Server/Feudopoly.Server/
RUN dotnet restore Feudopoly.Server/Feudopoly.Server/Feudopoly.Server.csproj

COPY . .
RUN dotnet publish Feudopoly.Server/Feudopoly.Server/Feudopoly.Server.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Feudopoly.Server.dll"]
