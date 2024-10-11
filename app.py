# import sys
# from stages import overview
# from PyQt5.QtGui import *
# from PyQt5.QtWidgets import *
# from PyQt5.QtCore import *



# class MyWidget(QWidget):
#     def __init__(self):
#         super().__init__()

#         #template/overall structure
#         self.main = QVBoxLayout()

        
#         self.row1 = QHBoxLayout()
#         self.overview = overview.Overview()
        
    
#         #now LHS taskbar
#         self.taskbar = QVBoxLayout()


#         self.logo = QLabel()

#         # Load an image using QPixmap
#         pixmap = QPixmap('images/FakeLogo.png')  # Replace with your image path
#         # Resize the image using the scaled method
#         pixmap = pixmap.scaled(200, 400, aspectRatioMode=Qt.KeepAspectRatio)
#         # Set the QPixmap on the QLabel
#         self.logo.setPixmap(pixmap)
#         self.taskbar.addWidget(self.logo)

#         #Live/Replay Status
#         self.status = QPushButton("Live/Replay") #placeholder
#         self.taskbar.addWidget(self.status)

#         #Chung/Hong Marker
#         self.chlabel = QLabel("Mark Quotas")
#         self.chlabel.setAlignment(Qt.AlignCenter)
#         self.taskbar.addWidget(self.chlabel)

#         # self.chButton = 
#         self.chungBTM = QLabel("Chung")
#         self.hongBTM = QLabel("Hong")



#         self.row1.addLayout(self.taskbar)
#         self.row1.addLayout(self.overview.getLayout())
#         self.main.addLayout(self.row1)



#         self.setLayout(self.main)
        


# if __name__ == "__main__":
    
#     app = QApplication(sys.argv)
#     widget = MyWidget()
#     # widget.resize(1500, 1200)
#     widget.show()


#     sys.exit(app.exec())



import sys
from stages import *
# from camera import connection
from PyQt5.QtGui import *
from PyQt5.QtWidgets import QApplication, QStackedWidget
from PyQt5.QtCore import *


class App(QApplication):
    def __init__(self, sys_argv):
        super().__init__(sys_argv)
        
        
        # Create the page controller with signals
        # self.controller = PageController()

        # Create the page manager (QStackedWidget is good for switching between pages)
        self.page_manager = QStackedWidget()

        # Initialize pages
        self.setup = Setup()
        # self.overview = self.init_overview()
        self.overview = Overview()
        # Add pages to the page manager
        self.page_manager.addWidget(self.setup)
        self.page_manager.addWidget(self.overview)

        # Show the setup page first
        # self.page_manager.setCurrentWidget(self.setup)
        self.page_manager.setCurrentWidget(self.overview)

        # Listen for signal from one page to another
        # self.controller.show_overview.connect(self.switch_to_overview)
        # self.controller.show_setup.connect(self.switch_to_setup) 
        

        self.page_manager.show()

    

    # def init_overview(self):
        #connect cameras
        # self.cameras_connection = connection.Connection()
        # self.overview = Overview(self.cameras_connection)
        
        
    # def init_single_camera_page(self, cam_num):
    #     pass


    # # @Slot()
    # def switch_to_overview(self):
    #     """Switch to the main page when the signal is received."""
    #     self.page_manager.setCurrentWidget(self.overview)
    
    # # @Slot()
    # def switch_to_setup(self):
    #     """Switch to the main page when the signal is received."""
    #     self.page_manager.setCurrentWidget(self.setup)


if __name__ == "__main__":
    app = App(sys.argv)
    # app.resize(1500, 1200)


    sys.exit(app.exec())