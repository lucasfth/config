import struct,sys
# Minimal independent peer verifies header layout, dimensions and defaults.
while True:
 header=sys.stdin.buffer.read(52)
 if not header:break
 magic,w,h,screen,mode,despill,encoding,policy,black,white,grow,softness=struct.unpack('<8sIIIIfIIffff',header)
 assert magic==b'CK2OFX02' and 0<w<=8192 and 0<h<=8192 and w<=40000000//h
 assert (screen,mode,despill,encoding,policy,black,white,grow,softness)==(0,0,1.,0,0,0.,1.,0.,0.)
 count=w*h*16
 pixels=sys.stdin.buffer.read(count)
 assert len(pixels)==count
 sys.stdout.buffer.write(struct.pack('<II',0,count)+pixels)
 sys.stdout.buffer.flush()
