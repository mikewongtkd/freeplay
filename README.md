# FreePlay an Instant Video Replay UI

Instant Video FreePlay (aka FreePlay) is an Instant Video Replay UI for
Taekwondo competition IVR systems.

# Development Platform

Developers should be familiar with Python 3, Conda, OpenCV, Git.

## Getting Started

There are several steps to get started

### Configure the Camera Setup

#### XVim

- Connect a mouse and monitor to the XVim DVR.
- Login using the default credentials (`admin` and no password)
- Right click anywhere on the screen and choose `Main Menu`
- Choose `Network`
- Clear the checkbox for `DHCP`
- Change the network to `Manual IP` and leave the default address (`192.168.1.10`)
- Click `OK`
- Right-click to dismiss the main menu and return to the camera viewing mode

### Creating the FreePlay Docker Image

	cd docker
	make

### Running the FreePlay Docker Container

	cd ..
	make
