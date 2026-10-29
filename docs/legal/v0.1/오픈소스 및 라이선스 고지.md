# 「여정」 오픈소스 및 라이선스 고지

버전 0.1 · 시행일 2026-10-30

「여정」은 아래의 제3자 리소스와 오픈소스 소프트웨어를 사용합니다. 각 리소스의 저작권은 해당 권리자에게 있으며, 각 라이선스 조건에 따라 사용합니다.

---

## 1. 아이콘

서비스의 아이콘은 Lucide(https://lucide.dev)의 아이콘을 ISC License에 따라 사용합니다.

| 리소스 | 버전 | 라이선스 | 저작권 |
|---|---|---|---|
| lucide-react | 1.62.0 | ISC License (Feather에서 온 아이콘은 MIT License) | Copyright (c) 2026 Lucide Icons and Contributors. Feather에서 온 아이콘: Copyright (c) 2013-present Cole Bemis |

## 2. 글꼴

| 글꼴 | 배포 패키지 | 저작권 | 라이선스 |
|---|---|---|---|
| Noto Sans KR | @fontsource-variable/noto-sans-kr 5.3.1 | Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'. | SIL Open Font License 1.1 |
| IBM Plex Sans KR | @fontsource/ibm-plex-sans-kr 5.3.0 | Copyright © 2017 IBM Corp. with Reserved Font Name "Plex". | SIL Open Font License 1.1 |

두 글꼴은 아래 SIL Open Font License 1.1에 따라 사용합니다.

<details>
<summary>SIL Open Font License, Version 1.1 전문</summary>

```
Copyright (c) <dates>, <Copyright Holder> (<URL|email>),
with Reserved Font Name <Reserved Font Name>.

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) and the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

</details>

## 3. 브랜드 리소스와 상표

- **카카오 로그인**: 로그인 화면의 카카오 로그인 버튼과 심볼은 Kakao Developers가 제공하는 카카오 로그인 리소스와 디자인 가이드에 따라 사용합니다. "카카오", "Kakao", 카카오 로그인 심볼은 주식회사 카카오의 상표입니다.

## 4. 오픈소스 소프트웨어

### 4-1. 화면(웹 앱)에 포함된 소프트웨어

운영 빌드 결과물(브라우저로 내려가는 파일)에 실제로 들어가는 패키지입니다. 글꼴(2절)과 아이콘(1절)은 위에 따로 적었습니다.

| 패키지 | 버전 | 라이선스 | 저작권 |
|---|---|---|---|
| react | 19.3.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| react-dom | 19.3.1 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| scheduler | 0.28.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| react-router | 8.5.0 | MIT | Copyright (c) React Training LLC 2015-2019, Copyright (c) Remix Software Inc. 2020-2021, Copyright (c) Shopify Inc. 2022-2023 |
| @tanstack/react-query, @tanstack/query-core | 5.105.0 | MIT | Copyright (c) 2021-present Tanner Linsley |
| clsx | 2.1.1 | MIT | Copyright (c) Luke Edwards (lukeed.com) |
| micro-rsa-dsa-dh | 0.4.0 | MIT | Copyright (c) 2024 Paul Miller (https://paulmillr.com) |
| @noble/hashes | 2.4.0 | MIT | Copyright (c) 2022 Paul Miller (https://paulmillr.com) |
| tailwindcss (생성된 스타일시트) | 4.3.3 | MIT | Copyright (c) Tailwind Labs, Inc. |
| vite (빌드 시 삽입되는 런타임 코드) | 8.3.5 | MIT | Copyright (c) 2019-present, VoidZero Inc. and Vite contributors |
| rolldown (빌드 시 삽입되는 런타임 코드) | 1.2.15 | MIT | Copyright (c) 2024-present VoidZero Inc. & Contributors |

### 4-2. 서버에서 사용하는 소프트웨어

서버 소프트웨어는 이용자에게 배포되지 않지만, 투명성을 위하여 주요 구성 요소를 함께 알립니다.

| 패키지 | 라이선스 |
|---|---|
| @nestjs/common, @nestjs/core, @nestjs/config, @nestjs/event-emitter, @nestjs/platform-express, @nestjs/swagger, @nestjs/throttler | MIT |
| @prisma/client, @prisma/adapter-pg | Apache License 2.0 |
| class-transformer, class-validator, cookie, helmet, nestjs-pino, pino, pino-http | MIT |
| reflect-metadata, rxjs | Apache License 2.0 |

### 4-3. 라이선스 전문

<details>
<summary>MIT License</summary>

```
MIT License

Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>

<details>
<summary>ISC License</summary>

```
ISC License

Copyright (c) <year> <copyright holders>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

</details>

- Apache License 2.0 전문: https://www.apache.org/licenses/LICENSE-2.0

## 5. 문의

라이선스 고지에 관한 문의는 rlawnsdyd530@gmail.com으로 보내 주시기 바랍니다.
