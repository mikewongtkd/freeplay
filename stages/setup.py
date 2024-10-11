from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import Qt



class Setup(QWidget):
    # Signal to inform app.py to switch pages
    # start_signal = pyqtSignal()
    def __init__(self, controller):
        super().__init__()

        #template/overall structure
        self.main = QVBoxLayout()

        
        self.logo = QLabel()

        # Load an image using QPixmap
        pixmap = QPixmap('images/FakeLogo.png')  # Replace with your image path
        # Resize the image using the scaled method
        pixmap = pixmap.scaled(400, 400, aspectRatioMode=Qt.KeepAspectRatio)
        # Set the QPixmap on the QLabel
        self.logo.setPixmap(pixmap)
        self.main.addWidget(self.logo)

        
        self.start_button = QPushButton("Start", self)
        self.main.addWidget(self.start_button)
        # Connect the button click to the method that emits the signal
        self.start_button.clicked.connect(controller.show_overview.emit)

        self.setLayout(self.main)