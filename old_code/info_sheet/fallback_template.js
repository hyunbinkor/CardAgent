// fallback_template.js
const fallbackTemplate = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>신세계 The BLOSSOM 신한카드 서비스</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
        }

        body {
            font-size: 11px;
            line-height: 1.4;
            color: #333;
            background-color: #f5f5f5;
        }

        .container {
            display: flex;
            width: 1144px; /* Exact width to match the PDF */
            margin: 0 auto;
        }

        .main-content {
            width: 940px;
            background-color: white;
        }

        .sidebar {
            width: 304px;
            background-color: #f0f2f5;
            padding: 20px 15px;
        }

        .header {
            background-color: #2e3192;
            color: white;
            padding: 8px 35px;
            font-weight: bold;
            margin-bottom: 15px;
            font-size: 12px;
        }

        .service-container {
            display: flex;
            padding: 0;
        }

        .service-box {
            flex: 1;
            padding: 0 15px;
            position: relative;
        }

        /* Add subtle dividers between service boxes */
        .service-box + .service-box:before {
            content: "";
            position: absolute;
            top: 10px;
            bottom: 10px;
            left: 0;
            width: 1px;
            background-color: #eee;
        }

        .service-icon {
            display: inline-block;
            width: 24px;
            height: 24px;
            margin-right: 8px;
            vertical-align: middle;
        }

        .icon-department {
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232e3192"><path d="M12 2L2 7v15h20V7L12 2z"/></svg>');
            background-repeat: no-repeat;
            background-position: center;
        }

        .icon-affiliate {
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232e3192"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 4c0 .55-.45 1-1 1s-1-.45-1-1V8h2v2zm4 0c0 .55-.45 1-1 1s-1-.45-1-1V8h2v2z"/></svg>');
            background-repeat: no-repeat;
            background-position: center;
        }

        .icon-lifestyle {
            background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232e3192"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>');
            background-repeat: no-repeat;
            background-position: center;
        }

        .service-title {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
            font-weight: bold;
            font-size: 12px;
            position: relative;
        }

        /* Custom icons that match the PDF exactly */
        .custom-icon {
            display: block;
            width: 20px;
            height: 20px;
            margin-right: 5px;
            background-color: #2e3192;
            color: white;
            text-align: center;
            line-height: 20px;
            border-radius: 2px;
        }

        .service-content {
            margin-bottom: 20px;
        }

        .blue-bg {
            background-color: #e7ecf7;
            padding: 10px;
            margin: 8px 0;
            border-radius: 0;
            font-size: 11px;
        }

        .section-title {
            font-weight: bold;
            margin: 15px 0 8px;
            font-size: 12px;
        }

        .text-content {
            font-size: 11px;
            margin-bottom: 5px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0 12px;
            font-size: 11px;
        }

        th, td {
            border: 1px solid #ddd;
            padding: 5px 3px;
            text-align: center;
            vertical-align: middle;
            line-height: 1.3;
        }

        th {
            background-color: #f5f5f5;
            font-weight: normal;
        }

        .note {
            position: relative;
            padding-left: 10px;
            margin-bottom: 3px;
            font-size: 11px;
            line-height: 1.3;
        }

        .note:before {
            content: "※";
            position: absolute;
            left: 0;
        }

        .sidebar-title {
            font-weight: bold;
            border-bottom: 1px solid #ccc;
            padding-bottom: 8px;
            margin-bottom: 15px;
            font-size: 12px;
        }

        .sidebar-section {
            margin-bottom: 15px;
        }

        .sidebar-section-title {
            font-weight: bold;
            margin: 15px 0 8px;
            font-size: 11px;
        }

        .dash-note {
            position: relative;
            padding-left: 8px;
            margin-bottom: 3px;
            font-size: 11px;
            line-height: 1.3;
        }

        .dash-note:before {
            content: "-";
            position: absolute;
            left: 0;
        }

        .divider {
            width: 100%;
            height: 1px;
            background-color: #ddd;
            margin: 12px 0;
        }

        /* Exact spacing to match PDF */
        .mb-5 {
            margin-bottom: 5px;
        }

        .mb-10 {
            margin-bottom: 10px;
        }

        .mb-15 {
            margin-bottom: 15px;
        }

        .mt-15 {
            margin-top: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="main-content">
            <div class="header">
                신세계 The BLOSSOM 신한카드 서비스
            </div>

            <div class="service-container">
                <div class="service-box">
                    <div class="service-title">
                        <span class="custom-icon">백</span>
                        신세계백화점 서비스
                    </div>
                    <div class="service-content">
                        <div class="text-content">신세계백화점 최대 7% 결제일 할인 및 마이신한포인트 1% 적립</div>

                        <div class="blue-bg">
                            <div>[신세계백화점 서비스 대상 가맹점]</div>
                            <div>신세계백화점 오프라인 전점 및 SSG닷컴 내 신세계백화점몰</div>
                        </div>

                        <div class="section-title">최대 7% 결제일 할인</div>
                        <div class="text-content">전월(1일~말일) 이용금액별 5~7% 결제일 할인</div>

                        <table>
                            <thead>
                                <tr>
                                    <th>전월 이용금액<br>(일시불+할부)</th>
                                    <th>50만원 이상<br>100만원 미만</th>
                                    <th>100만원 이상<br>150만원 미만</th>
                                    <th>150만원 이상</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>신세계백화점<br>할인율</td>
                                    <td>5%</td>
                                    <td>6%</td>
                                    <td>7%</td>
                                </tr>
                                <tr>
                                    <td>신세계백화점<br>월간 할인한도</td>
                                    <td>2만원</td>
                                    <td>3만원</td>
                                    <td>4만원</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 50만원 이상인 경우 할인 적용됩니다.</div>
                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 이용금액에 따른 신세계백화점 월간 할인한도 내에서 당월(1일~말일) 기준으로 적용됩니다.</div>
                        <div class="note">일 1회, 월 6회 할인 적용됩니다.</div>
                        <div class="note">할인액 기준 1회 1만원까지 할인 적용됩니다.</div>

                        <div class="section-title">마이신한포인트 1% 적립</div>
                        <div class="text-content">1회 이용금액이 1백만원 이상 이용 건에 한해 마이신한포인트 1%적립 (월 1만 포인트 한도)</div>

                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 50만원 이상인 경우 적립 적용됩니다.</div>
                        <div class="note">신세계백화점 「마이신한포인트 1% 적립」 서비스는 신세계백화점 「최대 7% 결제일 할인」 서비스 적용 건에 대해서도 중복 적용됩니다.</div>
                        <div class="note">적립포인트 기준 월 1만 포인트까지 적립 적용됩니다.</div>
                        <div class="note">마이신한포인트 사용/소멸 등 기본정책은 포인트 운영기준을 따르며, 신한카드 홈페이지(www.shinhancard.com) > 고객센터 > 이용약관 > 포인트 세부 운영기준에서 확인 가능합니다.</div>

                        <div class="mt-15">
                            <div class="note">[신세계백화점 서비스 유의사항]</div>
                            <div class="note">상품권 구매 등 비쇼핑 항목은 서비스 적용 제외됩니다.</div>
                            <div class="note">백화점에 입점된 임대 매장은 서비스 적용 제외됩니다.</div>
                            <div class="note">할인/적립 서비스 제외대상을 포함한 유의사항 및 전월이용금액 관련 세부 기준은 [신세계 The BLOSSOM 신한카드 할인/적립 서비스 유의사항] 페이지에서 확인 바랍니다.</div>
                        </div>
                    </div>
                </div>

                <div class="service-box">
                    <div class="service-title">
                        <span class="custom-icon">계</span>
                        신세계 계열사 할인 서비스
                    </div>
                    <div class="service-content">
                        <div class="text-content">신세계 계열사 5% 결제일 할인</div>

                        <div class="blue-bg">
                            <div>[신세계 계열사]</div>
                            <div>이마트/이마트 트레이더스/신세계 프리미엄 아울렛/신세계 면세점 오프라인 가맹점 및 SSG닷컴 내 신세계백화점몰 외 가맹점 전체</div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th>전월 이용금액<br>(일시불+할부)</th>
                                    <th>50만원 이상<br>100만원 미만</th>
                                    <th>100만원 이상<br>150만원 미만</th>
                                    <th>150만원 이상</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>신세계 계열사<br>월간 할인한도</td>
                                    <td>1만원</td>
                                    <td>1만3천원</td>
                                    <td>1만5천원</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 50만원 이상인 경우 할인 적용됩니다.</div>
                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 이용금액에 따른 신세계 계열사 월간 할인한도 내에서 당월(1일~말일) 기준으로 적용됩니다.</div>
                        <div class="note">가맹점 통합 일 1회 할인 적용됩니다.</div>
                        <div class="note">신세계 계열사 할인 서비스는 할인액 기준 1회 5천원까지 할인 적용됩니다.</div>
                        <div class="note">상품권 구매 등 비쇼핑 항목은 할인 제외됩니다.</div>
                        <div class="note">신세계 계열사에 입점된 임대 매장은 할인 제외됩니다.</div>

                        <div class="mt-15">
                            <div class="note">[신세계 계열사 할인 서비스 유의사항]</div>
                            <div class="note">할인 서비스 제외를 포함한 유의사항 및 전월이용금액 관련 세부 기준은 [신세계 The BLOSSOM 신한카드 할인/적립 서비스 유의사항] 페이지에서 확인 바랍니다.</div>
                        </div>
                    </div>
                </div>

                <div class="service-box">
                    <div class="service-title">
                        <span class="custom-icon">생</span>
                        생활할인 서비스
                    </div>
                    <div class="service-content">
                        <div class="text-content">커피/배달앱/온라인서점/잡화 5% 결제일 할인</div>

                        <div class="note mb-5">커피 : 스타벅스(사이렌오더 포함), 투썸플레이스, 커피빈, 엔젤리너스</div>
                        <div class="note">스타벅스 사이렌오더를 통한 식음료 구매 시 할인 적용되며, 온라인 충전 및 선물하기 거래는 할인 제외됩니다.</div>
                        <div class="note">투썸플레이스, 커피빈, 엔젤리너스는 오프라인 매장에 한하여 할인 적용되며 앱/웹을 통한 온라인 결제 건은 할인 제외됩니다.</div>
                        <div class="note mb-10">백화점, 할인점, 면세점, 공항 등에 입점된 매장 및 상품권, 선불카드 구입/충전 건 할인 제외됩니다.</div>

                        <div class="note mb-5">배달앱 : 배달의민족, 요기요, 땡겨요</div>
                        <div class="note mb-10">공식 배달앱에서 '앱 내 카드 결제 > 신세계 The BLOSSOM 신한카드 결제' 시 적용되며, '만나서/현장 카드 결제, 페이결제' 등 그외 결제 거래는 할인 제외됩니다.</div>

                        <div class="note mb-5">온라인서점 : 교보문고, YES24, 알라딘</div>
                        <div class="note mb-10">오프라인 매장 할인 제외됩니다.</div>

                        <div class="note mb-5">잡화 : 다이소, 올리브영</div>
                        <div class="note">오프라인 매장에 한하여 할인 적용되며 앱/웹을 통한 온라인 결제 건은 할인 제외됩니다.</div>
                        <div class="note mb-10">백화점, 할인점, 면세점, 공항 등에 입점된 매장 및 상품권, 선불카드 구입/충전 건 할인 제외됩니다.</div>

                        <table>
                            <thead>
                                <tr>
                                    <th>전월 이용금액<br>(일시불+할부)</th>
                                    <th>50만원 이상<br>100만원 미만</th>
                                    <th>100만원 이상<br>150만원 미만</th>
                                    <th>150만원 이상</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>생활할인서비스<br>월간 할인한도</td>
                                    <td>5천원</td>
                                    <td>7천원</td>
                                    <td>1만원</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 50만원 이상인 경우 할인 적용됩니다.</div>
                        <div class="note">신세계 The BLOSSOM 신한카드의 전월(1일~말일) 이용금액에 따른 생활할인서비스 월간 할인한도 내에서 당월(1일~말일) 기준으로 적용됩니다.</div>
                        <div class="note">커피/ 배달앱 /온라인서점/잡화 업종별 통합 일 1회, 월 3회 할인 적용됩니다.</div>
                        <div class="note">커피/온라인서점/잡화 할인 서비스는 할인액 기준 1회 1천원까지, 배달앱 할인 서비스는 할인액 기준 1회 2천원까지 할인 적용됩니다.</div>

                        <div class="mt-15">
                            <div class="note">[생활할인 서비스 유의사항]</div>
                            <div class="note">할인 서비스 제외를 포함한 유의사항 및 전월이용금액 관련 세부 기준은 [신세계 The BLOSSOM 신한카드 할인/적립 서비스 유의사항] 페이지에서 확인 바랍니다.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="sidebar">
            <div class="sidebar-title">할인/적립 서비스 유의사항</div>

            <div class="sidebar-section">
                <div class="sidebar-section-title">신세계 The BLOSSOM 신한카드 할인/적립 서비스 유의사항</div>

                <div class="note mb-5">[할인서비스 적용 기준]</div>
                <div class="note">간편결제(Pay)로 결제 시 가맹점명이 해당 업체가 아닌 간편결제명(네이버페이, 스마일페이 등)인 경우 서비스 적용 제외되오니 유의 바랍니다.</div>
                <div class="note">서비스 영역별 고객님이 이용하신 거래 순서대로 서비스 적용됩니다.</div>
                <div class="note">서비스 이용 후 서비스 적용된 거래 건이 해당월에 취소된 경우 할인/적립 서비스 횟수 및 한도가 복원됩니다.</div>
                <div class="note mb-5">할인/적립 서비스 제외 대상은 아래와 같습니다.</div>

                <div class="dash-note">기프트카드/선불카드 구매 · 충전금액</div>
                <div class="dash-note">포인트 사용거래 중 포인트금액</div>
                <div class="dash-note">무이자할부(슬림할부 등 부분 무이자포함) 이용거래</div>
                <div class="dash-note">상품권/선불전자지급수단 구매 · 충전금액</div>
                <div class="dash-note">신세계 The BLOSSOM 신한카드로 신한카드 할인서비스(이벤트 포함)를 적용받은 모든 거래(해당 거래금액 전체)</div>
                <div class="dash-note mb-10">거래 취소금액</div>

                <div class="note mb-5">[전월 이용금액 기준]</div>
                <div class="note">전월 이용금액은 신세계 The BLOSSOM 신한카드의 전월(1일~말일)의 거래시점 이용금액 (일시불+할부)을 기준으로 반영됩니다.</div>
                <div class="dash-note">해외 이용 금액은 매입일자를 기준으로 반영 됩니다.</div>
                <div class="dash-note">교통카드 이용금액은 전전월 이용금액이 전월 이용금액에 반영됩니다.</div>
                <div class="dash-note mb-10">(단, 모바일 후불 교통카드 이용금액은 전월 이용금액이 반영됨)</div>

                <div class="note">본인카드와 가족카드의 전월 이용금액, 월별 할인횟수 및 할인한도는 합산 적용됩니다.</div>
                <div class="note">신세계 The BLOSSOM 신한카드 신규 발급 회원의 경우 카드 사용 등록월의 익월 말(등록월+1개월)까지는 전월 이용금액 50만원 이상 100만원 미만 구간의 서비스가 적용됩니다. 단, 해당기간 중에라도 월 100만원 이상 이용할 경우 다음달에 해당 이용금액 구간에 상응하는 서비스가 적용됩니다.</div>
                <div class="note mb-5">전월 이용금액 제외 대상은 아래와 같습니다.</div>

                <div class="dash-note">단기카드대출(현금서비스), 장기카드대출(카드론)</div>
                <div class="dash-note">연회비</div>
                <div class="dash-note">각종 수수료/이자(할부수수료, 연체이자 등)</div>
                <div class="dash-note">기프트카드/선불카드 구매 · 충전금액</div>
                <div class="dash-note">상품권/선불전자지급수단 구매 · 충전금액</div>
                <div class="dash-note">거래 취소금액</div>
            </div>
        </div>
    </div>
</body>
</html>
`;

module.exports = fallbackTemplate;