#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
This Python script shows Wyze v2 cam live using the RTSP link

Author  : Arul John
Created :
Updated :
"""

import cv2

# RTSP info -- change these 5 values according to your RTSP URL
username = 'admin'
password = ''
endpoint = 'cam/realmonitor?channel='
ip = '192.168.0.118'

# Stream
stream1 = cv2.VideoCapture(f'rtsp://{username}:{password}@{ip}/{endpoint}1')
stream2 = cv2.VideoCapture(f'rtsp://{username}:{password}@{ip}/{endpoint}2')

try:
    while True:
        # Read the input live stream
        ret1, frame1 = stream1.read()
        ret2, frame2 = stream2.read()

        height, width, layers = frame1.shape
        frame1 = cv2.resize( frame1, ( width, height // 2 ));
        frame2 = cv2.resize( frame2, ( width, height // 2 ));

        frame = cv2.hconcat([frame1, frame2])

        # Show video frame
        cv2.imshow( 'CUTA Instant FreePlay IVR System', frame)

        # Quit when 'x' is pressed
        if cv2.waitKey(1) & 0xFF == ord('x'):
            break
except Exception as e:
    print("ERROR:", e)

# Main function
if __name__ == "__main__":
    # Release and close stream
    stream1.release()
    stream2.release()
    cv2.destroyAllWindows()
