#!/usr/bin/env python3
"""Protocol v2/v3 echo; temporal selects the requested frame, not a model."""
import struct,sys
H=struct.Struct('<8sIIIIfIIffff')
def read(n):
 data=bytearray()
 while len(data)<n:
  block=sys.stdin.buffer.read(n-len(data))
  if not block:raise EOFError('truncated')
  data.extend(block)
 return bytes(data)
while True:
 first=sys.stdin.buffer.read(1)
 if not first:break
 header=first+read(H.size-1);magic,width,height,*_=H.unpack(header);assert magic in (b'CK2OFX02',b'CK2OFX03')
 target=struct.unpack('<I',read(4))[0] if magic==b'CK2OFX03' else 0
 selected=None
 for index in range(4 if magic==b'CK2OFX03' else 1):
  data=read(width*height*16)
  if index==target:selected=data
 assert selected is not None
 sys.stdout.buffer.write(struct.pack('<II',0,len(selected))+selected);sys.stdout.buffer.flush()
