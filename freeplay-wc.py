#!/usr/bin/env python
# -*- coding: utf-8 -*-

import cv2

# Stream
stream1 = cv2.VideoCapture( 0 )
stream2 = cv2.VideoCapture( 1 )
stream3 = cv2.VideoCapture( 4 )

try:
    while True:
        # Read the input live stream
        ret1, frame1 = stream1.read()
        ret2, frame2 = stream2.read()
        ret3, frame3 = stream3.read()

        height, width, layers = frame1.shape
        frame1 = cv2.resize( frame1, ( width, height // 2 ))
        frame2 = cv2.resize( frame2, ( width, height // 2 ))

        top = cv2.hconcat([frame1, frame2])

        frame3 = cv2.resize( frame3, ( width, height // 2 ))

        bottom = cv2.hconcat([frame3, frame3])

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
    stream2.release()
    stream3.release()
    cv2.destroyAllWindows()
