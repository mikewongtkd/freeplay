from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *



class Main_Page(QWidget):
    def __init__(self):
        super().__init__()
        # self.controller = controller

    def setup_page(self, page, controller):
        #template/overall structure
        self.main = QVBoxLayout()

        
        self.row1 = QHBoxLayout()
  
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

        self.setupbtn = QPushButton("Setup")
        self.setupbtn.clicked.connect(controller.show_setup.emit)
        self.taskbar.addWidget(self.setupbtn)

        self.row1.addLayout(self.taskbar)
        self.row1.addLayout(page)
        self.main.addLayout(self.row1)



        self.setLayout(self.main)
        