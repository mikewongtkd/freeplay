from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
import cv2
from camera import error_message
from camera import camerainfo


# RTSP info -- change these 5 values according to your RTSP URL
username = camerainfo.username
password = camerainfo.password
endpoint = camerainfo.endpoint
ip = camerainfo.ip

class Camera(QThread): #creates thread for individual cameras
    imageUpdate = pyqtSignal(QImage)

    def __init__(self, camNum):
        super().__init__()
        self.camNum = camNum
    
    def run(self):
        try:
            self.ThreadActive = True
            self.capture = cv2.VideoCapture(f'rtsp://{username}:{password}@{ip}/{endpoint}{self.camNum}')
            # print("print capture" + str(self.capture.read()))
            while self.ThreadActive:
                ret, frame = self.capture.read()
                if ret:
                    height, width, layers = frame.shape
                    frame = cv2.resize( frame, ( width, height // 2 ))
                    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    
                else:
                    raise cv2.error


                #
                convertoQTFormat = QImage(image.data, image.shape[1], image.shape[0], QImage.Format_RGB888)
                pic = convertoQTFormat.scaled(500, 500, Qt.KeepAspectRatio)
                self.imageUpdate.emit(pic)
                
        except cv2.error as error:
            #return image as error pic
            print("aha i caught it!")
            message = "Camera Connection Error!"
            image = error_message.text_to_image(message, "Arial.ttf", 20, (255, 255, 255))
        
        


    def stop(self):
        self.ThreadActive = False
        self.capture.release()
        self.quit()