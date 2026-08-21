@ GBA entry point and cartridge header.
@
@ The first instruction has to be a branch past the 192-byte header. The BIOS
@ reads the header, checks it, then jumps back here.

.section .crt0, "ax"
.arm
.global _start
_start:
    b       .Lstart

    @ 0x04: the boot logo the BIOS checks before it will run anything.
    .include "logo.s"

    @ 0xA0: game title, 12 bytes, padded with zeros.
    .ascii  "ICEMONSTERS\0"
    @ 0xAC: game code, 0xB0: maker code
    .ascii  "AIMS"
    .ascii  "00"
    .byte   0x96            @ 0xB2 fixed
    .byte   0x00            @ 0xB3 main unit
    .byte   0x00            @ 0xB4 device type
    .space  7, 0            @ 0xB5 reserved
    .byte   0x00            @ 0xBC software version
    .byte   0x00            @ 0xBD complement, patched after linking
    .space  2, 0            @ 0xBE reserved

.Lstart:
    @ Interrupts off while we set up.
    mov     r0, #0x4000000
    mov     r1, #0
    str     r1, [r0, #0x208]        @ IME = 0

    @ System mode, stack at the top of IWRAM.
    mov     r0, #0x1f
    msr     cpsr_c, r0
    ldr     sp, =0x03007f00

    @ Copy .data from ROM into IWRAM.
    ldr     r0, =__data_lma
    ldr     r1, =__data_start
    ldr     r2, =__data_end
1:  cmp     r1, r2
    ldrlo   r3, [r0], #4
    strlo   r3, [r1], #4
    blo     1b

    @ Zero .bss.
    ldr     r0, =__bss_start
    ldr     r1, =__bss_end
    mov     r2, #0
2:  cmp     r0, r1
    strlo   r2, [r0], #4
    blo     2b

    ldr     r0, =main
    bx      r0

.Lhang:
    b       .Lhang

    .ltorg
