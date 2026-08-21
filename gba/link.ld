/* GBA cartridge layout. ROM is mapped at 0x08000000; IWRAM is the fast 32-bit
   scratch the hot loops live in. */
OUTPUT_FORMAT("elf32-littlearm")
OUTPUT_ARCH(arm)
ENTRY(_start)

MEMORY {
  rom  (rx)  : ORIGIN = 0x08000000, LENGTH = 32M
  iwram (rwx): ORIGIN = 0x03000000, LENGTH = 32K
  ewram (rwx): ORIGIN = 0x02000000, LENGTH = 256K
}

SECTIONS {
  .text : {
    KEEP(*(.crt0))
    *(.text .text.*)
    *(.rodata .rodata.*)
    . = ALIGN(4);
  } > rom

  __data_lma = .;

  .data : AT(__data_lma) {
    __data_start = .;
    *(.data .data.*)
    . = ALIGN(4);
    __data_end = .;
  } > iwram

  .bss (NOLOAD) : {
    __bss_start = .;
    *(.bss .bss.*)
    *(COMMON)
    . = ALIGN(4);
    __bss_end = .;
  } > iwram

  /* Anything too big for IWRAM goes in the slower external RAM. */
  .ewram (NOLOAD) : {
    *(.ewram .ewram.*)
    . = ALIGN(4);
  } > ewram

  /DISCARD/ : { *(.ARM.exidx*) *(.ARM.attributes) *(.comment) }
}
