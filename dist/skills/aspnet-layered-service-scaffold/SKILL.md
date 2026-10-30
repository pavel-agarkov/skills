---
name: aspnet-layered-service-scaffold
description: >
  Scaffold a dedicated ASP.NET Core Minimal API service with its own solution,
  layered Api/Application/Domain/Persistence projects, OpenAPI and health
  endpoints, and unit/integration/architecture tests. Use when the user asks
  to create a .NET microservice folder, bootstrap a layered backend, set up
  Clean Architecture projects, or turn a PRD into an API service skeleton.
tags: [dotnet, backend, scaffold]
---

# ASP.NET Layered Service Scaffold

Create one independently buildable and deployable ASP.NET Core Minimal API
service. The service lives in its own folder, owns its solution, keeps business
logic independent from adapters, and starts with executable architecture and
HTTP verification.

This skill combines:

- the typed endpoint and OpenAPI practices from
  `/aspnet-minimal-api-openapi`;
- the structure, dependency injection, documentation, async, testing, error
  handling, and security guidance from `/dotnet-best-practices`;
- lessons from scaffolding a real layered service, including validating
  transitive NuGet vulnerabilities before accepting template dependencies.

## When to use

Use this skill when the user asks to:

- create or scaffold an ASP.NET Core backend or microservice;
- give each microservice a separate folder and solution;
- establish Api, Application, Domain, and Persistence project boundaries;
- create a Minimal API skeleton from a PRD;
- add health, OpenAPI, integration-test, or architecture-test foundations.

If the user asks only for one endpoint in an existing solution, use
`/aspnet-minimal-api-openapi` instead. If the user asks for a general review of
existing C# code, use `/dotnet-best-practices` instead.

## Inputs

Accept an optional PRD or architecture document path:

```text
/aspnet-layered-service-scaffold @context/foundation/prd.md
```

Strip a leading `@`, verify that the file exists, and read it fully. Use it to
infer the product name, backend responsibilities, persistence technology,
authentication needs, deployment target, and existing testing conventions.
Never invent feature endpoints that are outside the requested scaffold scope.

Also inspect:

1. repository instructions and existing `.sln`, `.slnx`, `.csproj`,
   `Directory.Build.*`, and `global.json` files;
2. the installed SDK with `dotnet --info`;
3. repository status so unrelated user changes are preserved;
4. existing package and test-framework conventions.

## Clarification interview

Ask only questions whose answers cannot be inferred safely from repository
evidence or the supplied document. Ask one question at a time and prefer
choices. Recommended order:

1. **Service boundary** — one MVP backend service or multiple deployables?
2. **Scope** — structure and representative operational endpoints, contract
   stubs, or full feature implementation?
3. **Project layout** — recommended:
   `Api`, `Application`, `Domain`, `Persistence`, plus unit, integration, and
   architecture tests.
4. **Service folder and solution name** — for example `api/Routinier.slnx`.
5. **Target framework** — prefer the latest installed stable SDK compatible
   with repository constraints.
6. **Test framework** — preserve repository convention. Do not replace xUnit,
   NUnit, MSTest, or TUnit merely because another general skill prefers a
   different framework.
7. **Persistence scope** — boundary only, or provider/ORM configuration now?

Do not ask for decisions already explicit in the request. If the user is
unavailable, choose conservative defaults and state them:

- one deployable service;
- structure plus representative health/OpenAPI wiring;
- `Api`, `Application`, `Domain`, `Persistence`;
- xUnit when no repository convention exists;
- persistence boundary only, without ORM packages or migrations.

Before implementation, summarize the resolved structure and exclusions.

## Target structure

Use service-local ownership:

```text
<service-folder>/
  <Product>.slnx
  global.json
  Directory.Build.props
  src/
    <Product>.Api/
    <Product>.Application/
    <Product>.Domain/
    <Product>.Persistence/
  tests/
    <Product>.Domain.UnitTests/
    <Product>.Api.IntegrationTests/
    <Product>.ArchitectureTests/
```

Prefer `.slnx` for modern SDKs unless the repository or tooling requires
`.sln`. A future microservice belongs in a sibling folder with its own solution;
do not add unrelated services to this solution.

### Dependency direction

Establish and test this graph:

```text
Domain <- Application <- Persistence
              ^             ^
              |             |
              +----- Api ---+
```

In project-reference terms:

- Domain references no other production project.
- Application references Domain.
- Persistence references Application and Domain.
- Api is the composition root and references Application and Persistence.
- Tests reference only the assemblies required by their scope.

The Domain and Application layers must not reference Api or Persistence.
Persistence must not reference Api.

## Workflow

### 1. Plan exact files and commands

Derive names from the product or explicit user input. Avoid generic solution
names such as `Backend` when a product name is known. Resolve path conflicts
before scaffolding and never overwrite existing files silently.

Use the .NET CLI for generated project metadata:

```powershell
dotnet new globaljson -o <service-folder> --sdk-version <sdk-version> --roll-forward latestPatch
dotnet new sln -n <Product> -o <service-folder> --format slnx
dotnet new webapi -n <Product>.Api -o <service-folder>\src\<Product>.Api --framework <tfm> --no-restore
dotnet new classlib -n <Product>.Application -o <service-folder>\src\<Product>.Application --framework <tfm> --no-restore
dotnet new classlib -n <Product>.Domain -o <service-folder>\src\<Product>.Domain --framework <tfm> --no-restore
dotnet new classlib -n <Product>.Persistence -o <service-folder>\src\<Product>.Persistence --framework <tfm> --no-restore
```

Create the selected test projects, add every project to the service solution,
and add references explicitly. Stop immediately on CLI failure.

### 2. Apply shared build conventions

Add or extend a service-local `Directory.Build.props`. Preserve stronger
repository settings. Recommended baseline:

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <Deterministic>true</Deterministic>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
  </PropertyGroup>
</Project>
```

Replace `net10.0` with the resolved target framework. Avoid repeating shared
properties in every project when the repository accepts central configuration.
Document every public type and member when XML documentation is enabled.

### 3. Create layer composition modules

Keep `Program.cs` as the composition root. Add extension methods such as
`AddApplication` and `AddPersistence` in their owning projects. Each method:

- extends `IServiceCollection`;
- checks the collection with `ArgumentNullException.ThrowIfNull`;
- registers services with deliberate Singleton, Scoped, or Transient
  lifetimes;
- returns the collection for fluent composition.

Do not create empty interfaces merely to satisfy a pattern. Add interfaces
where they define a real boundary or improve testability. Prefer primary
constructors for injected dependencies. Use async APIs for I/O and return
`Task` or `Task<T>`.

When persistence implementation is excluded, create only the project boundary
and composition extension. Do not add EF Core, a provider, `DbContext`,
migrations, secrets, or connection strings.

### 4. Wire the Minimal API host

Use built-in framework facilities where practical:

```csharp
builder.Services
    .AddApplication()
    .AddPersistence()
    .AddProblemDetails()
    .AddHealthChecks();

builder.Services.AddOpenApi();
```

Configure standard error handling:

```csharp
app.UseExceptionHandler();
app.UseStatusCodePages();
```

Map:

- a liveness endpoint such as `/health`;
- built-in OpenAPI JSON in Development;
- one representative, versioned endpoint group such as `/api/v1`.

Do not add an interactive Swagger UI unless requested. Do not enable HTTPS
redirection blindly when the intended container or reverse proxy terminates
TLS; follow deployment requirements.

### 5. Define typed, documented endpoints

Put related endpoints in focused endpoint classes and group them with
`MapGroup()`. For each representative endpoint:

- define explicit request and response DTOs;
- prefer immutable records;
- describe DTO properties and parameters with `DescriptionAttribute`;
- use strongly typed route parameters;
- return `TypedResults`;
- use `Results<TSuccess, TProblem>` when multiple outcomes are possible;
- set operation ID with `WithName`;
- set `WithSummary` and `WithDescription`;
- declare response types and status codes with `Produces`;
- use validation attributes such as `Required` where applicable.

Example:

```csharp
group.MapGet("/system", GetSystemInfo)
    .WithName("GetSystemInfo")
    .WithSummary("Get API information")
    .WithDescription("Returns the service name and public API version.")
    .Produces<SystemInfoResponse>();

static Ok<SystemInfoResponse> GetSystemInfo() =>
    TypedResults.Ok(new SystemInfoResponse("Example API", "v1"));
```

Use endpoint filters for genuine cross-cutting concerns, not for ordinary
business logic. For larger APIs, organize by feature while preserving layer
boundaries.

### 6. Add executable verification

Replace generated placeholder tests with meaningful tests.

#### Domain unit tests

Add at least one real assembly or domain convention test. Follow the selected
framework's conventions and Arrange/Act/Assert structure.

#### API integration tests

Use `WebApplicationFactory<Program>` and expose `Program` for testing with:

```csharp
public partial class Program;
```

Verify:

- `/health` returns success and a healthy response;
- the representative endpoint returns the exact typed payload;
- the Development OpenAPI document exists and contains the representative
  path.

Test success and failure responses when the scaffold includes input.

#### Architecture tests

Use the repository's existing architecture-test library, or add a small,
well-maintained library such as NetArchTest when none exists. Enforce the
dependency direction defined above. Architecture tests must inspect compiled
assemblies; filename or textual checks are not sufficient.

### 7. Restore, secure, and validate

Run commands against the service-local solution:

```powershell
dotnet restore <service-folder>\<Product>.slnx
dotnet build <service-folder>\<Product>.slnx --no-restore
dotnet test <service-folder>\<Product>.slnx --no-build
dotnet format <service-folder>\<Product>.slnx --no-restore --verify-no-changes
dotnet list <service-folder>\<Product>.slnx package --vulnerable --include-transitive
```

Treat restore vulnerability warnings as real failures when warnings-as-errors
is enabled. Fix the dependency root cause; do not suppress `NU190x`.

Important template lesson: ASP.NET OpenAPI packages can bring a vulnerable
transitive `Microsoft.OpenApi` version even when the direct package appears
current. Check the advisory and NuGet metadata, then update to a compatible
patched framework package or explicitly patched transitive version. Never
hardcode a version from an old run without checking current releases.

After tests pass, run the real Kestrel host on a fixed unused HTTP port in
Development and probe the documented endpoints. Verify:

- health status and body;
- representative JSON fields;
- OpenAPI version and path presence.

Stop the temporary process by its exact process/session identifier. Finish with
`git diff --check`, repository status, and a search for stale template symbols
such as `weatherforecast`, `Class1`, and `UnitTest1`.

## Error-handling rules

- Do not catch broad exceptions or turn errors into success-shaped defaults.
- Use Problem Details for HTTP errors.
- Validate boundary input explicitly.
- Throw specific exceptions for impossible internal states.
- Use structured logging for operational failures when implementation scope
  includes behavior that can fail.
- Never place credentials in source-controlled configuration.
- Use parameterized queries when persistence implementation is in scope.

## Definition of done

The skill is complete only when:

- the dedicated solution contains every intended project;
- project references match the documented dependency graph;
- restore and build pass with zero warnings;
- all unit, integration, and architecture tests pass;
- formatting verification passes;
- the direct and transitive vulnerability scan is clean, or unresolved
  findings are clearly reported as blockers;
- live health, representative API, and OpenAPI checks pass;
- documentation contains restore, build, test, and run commands;
- no generated placeholder code remains;
- unrelated worktree changes are untouched.

Report the resolved assumptions, created structure, validation results, and
explicitly deferred functionality.
