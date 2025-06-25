import cv2

# https://dahuawiki.com/Remote_Access/RTSP_via_VLC#Example_URLs 

class Dahua:
    endpoint = 'cam/realmonitor'

    def __init__( self, ip = '192.168.1.10', username = 'admin', password = '' ):
        self.ip       = ip
        self.username = username
        self.password = password
        self.channel  = dict()

    def stream( self, channel = 1, subtype = None ):
        if channel in self.channel:
            return self.channel[ channel ]

        if subtype is None:
            key = f'{channel}'
            url = f'rtsp://{self.username}:{self.password}@{self.ip}/{Dahua.endpoint}?channel={channel}'
        else:
            key = f'{channel}.{subtype}'
            url = f'rtsp://{self.username}:{self.password}@{self.ip}/{Dahua.endpoint}?channel={channel}&subtype={subtype}'

        self.channel[ key ] = cv2.VideoCapture( url )
        return self.channel[ key ]
