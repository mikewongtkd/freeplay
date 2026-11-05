# Raspberry Pi 5 with Pironman5 Enclosure

## Pironman5 Powers Off When Browsing

A critical issue with the Pironman5 is that it requires 5.1V at 5A and most
USB-C power supplies supply 5.1V at 3A. Browsing causes a power spike draw
that exceeds 3A. The solution is to purchase an Rpi5-specific power supply
such as [CanaKit 45W Power Supply](https://www.amazon.com/dp/B07H125ZRL).

A workaround is to enable the pi to draw max current from the USB-C and
temporarily disable `piroman5` and `pipower5` services

### Configuring the RPi5 to Draw Max Current

The RPi5 has a software throttle configured by firmware on boot. The file
that holds the configuration is `/boot/firmware/config.txt`.

Run this command to see the current status

    vcgencmd get_config usb_max_current_enable

If `usb_max_current_enable=0` then the firmware is configured to throttle
current draw to 3A and will shut down the pi for draws over the limit. 

An alternative command is to check the firmware runtime configuration for the
`max_current`; this is in big-endian binary, so we'll need to decode it using
the command `od`

    od -An --endian=big -t dI /sys/firmware/devicetree/base/chosen/power/max_current

This returns `3000` to indicate the `max_current` is configured at 3k mV (=3V) or
`5000` to indicate 5k mV (=5V).

To change the `usb_max_current_enable` value, edit `/boot/firmware/config.txt` by
adding the following line near the top:

    usb_max_current_enable=1

After saving the changes, reboot the RPi.

**Note:** Editing `/boot/firmware/config.txt` reconfigures the firmware runtime,
which evidently breaks `vcgencmd`. This is OK, you can still check the setting
using the `od` command.

### Disabling Services that Monitor Max Current Draw

    sudo systemctl stop pironman5.service
    sudo systemctl disable pironman5.service
    sudo rmmod pipower5

### Restoring Services with the Correct Power Supply

With the correct power supply, in theory, these services can be restored

    sudo systemctl enable pironman5.service
    sudo systemctl start pironman5.service
    sudo enmod pipower5

Because we can't be certain that the correct power supply will always be used,
it may be safer to leave these services off.
