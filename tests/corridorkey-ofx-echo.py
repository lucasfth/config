import struct,sys
# Minimal test peer verifies the public protocol, not inference.
while True:
 header=sys.stdin.buffer.read(32)
 if not header:break
 magic,w,h,screen,mode,despill,encoding=struct.unpack('<8sIIIIfI',header)
 assert (magic,w,h,screen,mode,despill,encoding)==(b'CK2OFX01',1280,720,0,0,1.,0)
 count=w*h*16
 pixels=sys.stdin.buffer.read(count)
 assert len(pixels)==count
 sys.stdout.buffer.write(struct.pack('<II',0,count)+pixels)
 sys.stdout.buffer.flush()
