#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
This Python script shows Wyze v2 cam live using the RTSP link

Author  : Arul John
Created :
Updated :
"""

import cv2
from hwic.rtsp.dahua import Dahua

xvim = Dahua( '192.168.1.10' );

# Stream
# stream1 = cv2.VideoCapture(f'rtsp://{username}:{password}@{ip}/live')
stream1 = xvim.stream( 1 )
stream2 = xvim.stream( 2 )
stream3 = xvim.stream( 3 )
stream4 = xvim.stream( 4 )

try:
    while True:
        # Read the input live stream
#        ret, frame = stream1.read()
        ret1, frame1 = stream1.read()
        ret2, frame2 = stream2.read()
        ret3, frame3 = stream3.read()
        ret4, frame4 = stream4.read()

#         height, width, layers = frame.shape
#         frame = cv2.resize( frame, ( width * 2, height ))
        height, width, layers = frame1.shape
        frame1 = cv2.resize( frame1, ( width, height // 2 ))
        frame2 = cv2.resize( frame2, ( width, height // 2 ))

#         frame = cv2.hconcat([frame1, frame2])
        top = cv2.hconcat([frame1, frame2])

        frame3 = cv2.resize( frame3, ( width, height // 2 ))
        frame4 = cv2.resize( frame4, ( width, height // 2 ))

        bottom = cv2.hconcat([frame3, frame4])

        frame = cv2.vconcat([ top, bottom ])

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
#    stream2.release()
    cv2.destroyAllWindows()
