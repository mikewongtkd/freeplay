import sys
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *



class Setup(QWidget):
    def __init__(self):
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

        self.setLayout(self.main)
        


if __name__ == "__main__":
    
    app = QApplication(sys.argv)
    widget = Setup()
    # widget.resize(1500, 1200)
    widget.show()


    sys.exit(app.exec())