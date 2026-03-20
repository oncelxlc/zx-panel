# Copilot Instructions

This repository contains a fullstack application built with **Go
(backend)** and **Next.js (frontend)**.

The purpose of these instructions is to guide AI-generated code so that
it aligns with the architectural and coding practices of this
repository. These instructions are intentionally **framework-neutral and
non-opinionated** to minimize conflicts with existing implementations.

------------------------------------------------------------------------

# General Principles

When generating code:

1.  Prefer **clarity and maintainability** over clever or complex
    implementations.
2.  Follow **existing patterns in the repository** if similar code
    already exists.
3.  Avoid introducing new frameworks or dependencies unless explicitly
    requested.
4.  Prefer **small, composable functions** rather than large monolithic
    logic blocks.
5.  Maintain **consistent naming conventions** with the existing
    codebase.

If unsure about implementation details, generate code that is **easily
replaceable and modular**.

------------------------------------------------------------------------

# Repository Structure (Conceptual)

The repository generally follows a structure similar to:

    /backend      Go services and APIs
    /frontend     Next.js application
    /shared       Shared types or utilities (optional)

Generated code should respect the separation of concerns between
frontend and backend.

------------------------------------------------------------------------

# Backend (Go) Guidelines

## Language & Style

-   Use idiomatic Go.
-   Follow common Go project structure patterns when applicable.
-   Prefer standard library solutions where possible.
-   Use explicit error handling rather than panic.

Example:

    if err != nil {
        return err
    }

Avoid ignoring errors unless explicitly documented.

------------------------------------------------------------------------

## API Design

Backend services typically expose **HTTP APIs** consumed by the Next.js
frontend.

General expectations:

-   JSON request/response format
-   Clear request validation
-   Consistent response structures

Example response pattern:

    {
      "success": true,
      "data": {},
      "error": null
    }

However, if another response pattern already exists in the repository,
follow that instead.

------------------------------------------------------------------------

## Project Organization

Prefer logical grouping such as:

    /handlers
    /services
    /repositories
    /models
    /middleware

But do **not enforce this structure** if the project already uses a
different one.

------------------------------------------------------------------------

## Concurrency

When using goroutines:

-   Avoid shared mutable state unless protected.
-   Prefer channels or context propagation for cancellation.
-   Always respect `context.Context` when provided.

------------------------------------------------------------------------

## Logging

Prefer structured logging if logging already exists in the project.

Avoid introducing new logging frameworks unless already used.

------------------------------------------------------------------------

# Frontend (Next.js) Guidelines

## Framework Assumptions

Frontend uses **Next.js**.

Generated code should:

-   Work with modern Next.js features
-   Avoid deprecated APIs
-   Prefer server-safe patterns when applicable

Do not assume whether the project uses:

-   App Router
-   Pages Router

Follow whichever pattern already exists.

------------------------------------------------------------------------

## React Guidelines

-   Prefer **functional components**
-   Use **React hooks**
-   Avoid class components unless already present in the codebase

Example:

``` tsx
export default function Component() {
  return <div />
}
```

------------------------------------------------------------------------

## Data Fetching

Prefer patterns already used in the repository, such as:

-   `fetch`
-   `SWR`
-   `React Query`
-   Server Actions
-   API routes

Do not introduce a new data fetching library unless requested.

------------------------------------------------------------------------

## Styling

Follow whichever styling approach the repository already uses:

Possible options include:

-   CSS Modules
-   Tailwind
-   Styled Components
-   Plain CSS
-   UI frameworks

Do not introduce new styling libraries.

------------------------------------------------------------------------

# Type Sharing

If the repository contains shared types between frontend and backend:

-   Prefer **TypeScript interfaces** on the frontend
-   Keep API response shapes consistent with backend responses

Avoid duplicating types if shared definitions already exist.

------------------------------------------------------------------------

# API Communication

Frontend should communicate with backend APIs through:

    /api/*

or configured backend endpoints.

Generated code should avoid hardcoding environment-specific URLs.

Use environment variables when appropriate.

Example:

    process.env.NEXT_PUBLIC_API_BASE

------------------------------------------------------------------------

# Environment Configuration

Prefer environment variables for configuration.

Examples:

Backend:

    PORT
    DATABASE_URL

Frontend:

    NEXT_PUBLIC_API_BASE

Avoid hardcoding secrets or credentials.

------------------------------------------------------------------------

# Error Handling

Backend:

-   Return meaningful error messages
-   Avoid exposing sensitive internal errors

Frontend:

-   Handle loading states
-   Handle error states
-   Avoid silent failures

------------------------------------------------------------------------

# Security Considerations

Generated code should:

-   Validate external input
-   Avoid SQL injection risks
-   Avoid unsafe HTML rendering
-   Respect authentication middleware if present

------------------------------------------------------------------------

# Testing

If tests are generated:

Backend:

-   Use Go testing framework

Frontend:

-   Use the testing tools already present in the repository

Avoid introducing new testing frameworks.

------------------------------------------------------------------------

# Dependency Management

Backend:

    go.mod

Frontend:

    package.json

When suggesting dependencies:

-   Prefer widely used libraries
-   Avoid unnecessary dependencies

------------------------------------------------------------------------

# Performance

When generating code:

-   Avoid unnecessary allocations
-   Avoid redundant API calls
-   Prefer efficient data transformations

However, prioritize readability over micro-optimizations.

------------------------------------------------------------------------

# Documentation

Generated code should include minimal helpful comments where logic is
non-obvious.

Avoid excessive commenting of obvious behavior.

------------------------------------------------------------------------

# What Copilot Should Avoid

Avoid:

-   Large refactors
-   Introducing new architectural layers
-   Replacing existing libraries
-   Adding speculative features
-   Hardcoding environment-specific values

Unless the user explicitly asks for it.

------------------------------------------------------------------------

# Summary

When generating code:

1.  Follow existing repository patterns.
2.  Prefer idiomatic Go and modern React.
3.  Keep frontend and backend responsibilities clearly separated.
4.  Avoid introducing new frameworks unnecessarily.
5.  Generate modular and maintainable code.
