# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WorkHours — a workforce hours management system for allocating employee time across clients. Hebrew RTL interface. Built as a **single-file application** (`index.html`) with Vanilla JS, HTML, and CSS — no framework, no build system, no package manager.

## Development

Open `index.html` directly in a browser. No build step, no dev server required. All code (styles, markup, logic) lives in one file.

External libraries loaded via CDN:
- **Chart.js 4.4.0** — dashboard charts (bar, pie, line)
- **XLSX.js 0.20.3** — client-side Excel export

## Architecture

**State:** Single global `state` object persisted to `localStorage` under key `wh-state-v3`. Auto-saved after every mutation via `saveState()`.

**Routing:** SPA-style with `navigate(page)` swapping content. Six pages: Overview, Clients, Employees, Allocation Matrix, Weekly Schedule, Settings.

**Key data structures:**
- `state.matrix[monthKey][empId][clientId]` — hours allocation grid
- `state.weeklySchedule[monthKey][empId][day]` — array of clientIds per day
- `state.monthSetup[monthKey]` — work days, holidays per month
- `state.vacations[monthKey][empId]` — vacation days

**Business rules:**
- Employee hours = `workDays × 7 × (scope/100) - (vacDays × 7)`, overridable per month
- Allocations rounded to multiples of 5 using largest-remainder (`_split5`)
- Max 6 clients per employee in the matrix
- Auto-distribution uses `preferredClients` per employee
- Hebrew holidays are auto-calculated for month setup

## Language

UI text and variable names mix Hebrew and English. Comments and documentation are in Hebrew. `FUNCTIONALITY.md` contains the full feature specification in Hebrew.
