<div align="center">

# Jam Pal

Drum and bass to accompany your guitar jam

**[Try Jam Pal](https://1102aryan.github.io/jam-pal/)**

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)

</div>

## Overview

A real-time jam partner for a beginner guitarist. It listens through the microphone and follows your tempo to match with drums and bass accompaniment that adapts to how you play—by speeding up and slowing down with you. The goal is to build a tool for beginners to practice jamming and build the confidence to jam with real people.

## How it works

1. **Listen** — microphone audio is analysed each frame for energy and spectral flux.
2. **Onsets** — note attacks are detected from spectral flux (chosen over energy because guitar notes sustain rather than spike like a clap).
3. **Tempo** — the spacing between onsets gives a running BPM estimate.
4. **Steadiness** — the variance of recent onset spacing measures how consistent the player is.
5. **Follow** — a look-ahead scheduler plays the accompaniment, easing its tempo toward the player. How *hard* it follows is driven by steadiness: steady playing is tracked closely, unsteady playing is anchored.

The real-time audio (scheduling, sample playback) runs client-side because network latency would break musical timing.

## Screenshots

<div align="center">
  <img src="images/screenshots/mainPage.png" alt="Main Page" width="800" />
</div>

## Status 
The current application is a work in progress and will include these specific features:

- Genre selection (pop, rock, shoegaze, etc.)
- Style selection (controls how the tool behaves - support, lead, etc.)
- Specific animations
- AI analysis 
- Time signature modifications
- Adaptive workflow

<div align="center">

[Report Bug](https://github.com/1102Aryan/jam-pal/issues) • [Request Feature](https://github.com/1102Aryan/jam-pal/issues)

</div>