import sys
import overview
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
import cv2



class MyWidget(QWidget):
    def __init__(self):
        super().__init__()

        #template/overall structure
        self.main = QVBoxLayout()

        
        self.row1 = QHBoxLayout()
        self.overview = overview.Overview()
        
    
        #now LHS taskbar
        self.taskbar = QVBoxLayout()


        self.logo = QLabel()

        # Load an image using QPixmap
        pixmap = QPixmap('images/FakeLogo.png')  # Replace with your image path
        # Resize the image using the scaled method
        pixmap = pixmap.scaled(200, 400, aspectRatioMode=Qt.KeepAspectRatio)
        # Set the QPixmap on the QLabel
        self.logo.setPixmap(pixmap)
        self.taskbar.addWidget(self.logo)

        #Live/Replay Status
        self.status = QPushButton("Live/Replay") #placeholder
        self.taskbar.addWidget(self.status)

        #Chung/Hong Marker
        self.chlabel = QLabel("Mark Quotas")
        self.chlabel.setAlignment(Qt.AlignCenter)
        self.taskbar.addWidget(self.chlabel)

        # self.chButton = 
        self.chungBTM = QLabel("Chung")
        self.hongBTM = QLabel("Hong")



        self.row1.addLayout(self.taskbar)
        self.row1.addLayout(self.overview.getLayout())
        self.main.addLayout(self.row1)



        self.setLayout(self.main)
        


if __name__ == "__main__":
    
    app = QApplication(sys.argv)
    widget = MyWidget()
    # widget.resize(1500, 1200)
    widget.show()


    sys.exit(app.exec())