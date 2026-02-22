# This file is auto-generated. Do not modify.
#

top = '.'
out = 'build'

def configure(conf):
    conf.load('pebble_sdk')

def build(bld):
    bld.pbl_program(source=[], target='pebble-app.elf')

    bld.pbl_bundle(elf='pebble-app.elf',
                   js=bld.path.ant_glob('src/pkjs/**/*.js'))
