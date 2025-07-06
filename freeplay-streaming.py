#!/usr/bin/env python
# -*- coding: utf-8 -*-

import cv2
import socket
from hwic.rtsp.dahua import Dahua

xvim = Dahua( '192.168.1.10', 'admin', '' );

# Stream
stream = xvim.stream( 1 )

try:
    while True:
        # Read the input live stream
        ret, frame = stream.read()

        # Quit when 'x' is pressed
        if cv2.waitKey(1) & 0xFF == ord('x'):
            break
except Exception as e:
    print("ERROR:", e)

# Main function
if __name__ == "__main__":
    # Release and close stream
    stream.release()
