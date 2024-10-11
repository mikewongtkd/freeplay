import sys
from stages import *
from camera import connection
from PyQt5.QtGui import *
from PyQt5.QtWidgets import QApplication, QStackedWidget
from PyQt5.QtCore import *


class App(QApplication):
    
    def __init__(self, sys_argv):
        super().__init__(sys_argv)
        
        
        # Create the page controller with signals
        self.controller = PageController()

        # Create the page manager (QStackedWidget is good for switching between pages)
        self.page_manager = QStackedWidget()

        # Initialize pages
        self.setup = Setup(self.controller)
        self.cameras_connection = connection.Connection()
        self.overview = Overview(self.cameras_connection, self.controller)
        self.single_camera_page = SingleCamView(self.controller) #set up single_camera_page
        
        
        # Add pages to the page manager
        self.page_manager.addWidget(self.setup)
        self.page_manager.addWidget(self.overview)
        self.page_manager.addWidget(self.single_camera_page)
        
        # Show the setup page first
        self.page_manager.setCurrentWidget(self.setup)

        # Listen for signal from one page to another
        self.controller.show_overview.connect(self.switch_to_overview)
        self.controller.show_setup.connect(self.switch_to_setup) 
        self.controller.stop.connect(self.stop_cameras)
        self.controller.show_cam1.connect(lambda: self.switch_to_singleCam(1))
        self.controller.show_cam2.connect(lambda: self.switch_to_singleCam(2))
        self.controller.show_cam3.connect(lambda: self.switch_to_singleCam(3))
        self.controller.show_cam4.connect(lambda: self.switch_to_singleCam(4))

        self.page_manager.show()

        
        
    def switch_to_singleCam(self, cam_num):
        camera = self.overview.getCameraSlot(cam_num)

        self.single_camera_page.addCamera(camera)
        self.page_manager.setCurrentWidget(self.single_camera_page)


    # @Slot()
    def switch_to_overview(self):
        """Switch to the main page when the signal is received."""
        self.page_manager.setCurrentWidget(self.overview)
    
    # @Slot()
    def switch_to_setup(self):
        """Switch to the main page when the signal is received."""
        self.page_manager.setCurrentWidget(self.setup)

    def stop_cameras(self):
        self.cameras_connection.cancelFeed()
        QApplication.quit()



if __name__ == "__main__":
    app = App(sys.argv)

    sys.exit(app.exec())
    
