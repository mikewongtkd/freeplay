# FreePlay an Instant Video Replay UI

Instant Video FreePlay (aka FreePlay) is an Instant Video Replay UI for
Taekwondo competition IVR systems.

# Development Platform

Developers should be familiar with Python 3, Conda, OpenCV, Git.

## Getting Started

### Creating the Conda Environment

	conda create --name freeplay --file requirements.txt



#### Design Document
- There are four main pages/stages:
	- Setup/Main Page
		- Puts in the information for each match and starts/stop the recording at the beginning and end of the match.
	- Overview
		- Shows 4 cameras simultaneously.
		- Clicking on one camera brings it to Single Camera View
		- Full screen option is enabled (hides menu page)
		- Timeline shows camera 1 replays (main camera)
	- Single Camera View
		- Shows selected camera's view. Users can use +/- to min/max the cameras here.
		- Full screen option is enabled (hides menu page)
		- Timeline shows selected camera's replays
	- Timeline Search
		- Only enabled during replay state.
		- Gives an option to search up timeline for either of the four cameras.


Overview, Single Camera View, and Timeline Search relies on two states for functionalities.
In the Live state, the cameras are live.
In the replay state, the cameras are still recording, but certain functionalities are enabled:
	- Users can mark quotas (chung/hong)
	- Shows at what timestamp the appeal was made.
	- Until a decision is chosen, we will be in replay state.
	- Timeline search page is enabled, users can move the cursor and playback. The live side (still recording while they can replay) will not show up in timeline search while happening.
	- Additionally, timeline in Overview and Single Camera View will be interactive during this state.
	
test -anthony